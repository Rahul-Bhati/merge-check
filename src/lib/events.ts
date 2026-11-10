import { fetchPullDiff } from "./github";
import { rememberInstallation } from "./installations";
import { ingestPullRequest, kickCheck } from "./pipeline";
import { db } from "./db";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function handleGithubEvent(event: string, payload: unknown): Promise<{ status: number; body: string }> {
  if (!isRecord(payload)) return { status: 400, body: "Bad payload." };

  if (event === "installation" || event === "installation_repositories") {
    const installation = isRecord(payload.installation) ? payload.installation : null;
    if (!installation || typeof installation.id !== "number") return { status: 200, body: "ignored" };
    const account = isRecord(installation.account) ? installation.account : {};
    const login = typeof account.login === "string" ? account.login : "unknown";
    const accountType = typeof account.type === "string" ? account.type : "Organization";
    const action = typeof payload.action === "string" ? payload.action : "";
    if (action === "deleted") {
      const row = await db().installation.findUnique({ where: { githubInstallationId: String(installation.id) } });
      if (row) {
        await db().repository.updateMany({ where: { installationId: row.id }, data: { enabled: false } });
      }
      return { status: 200, body: "disabled" };
    }
    const repositories = Array.isArray(payload.repositories) ? payload.repositories : [];
    await rememberInstallation({
      githubInstallationId: String(installation.id),
      accountLogin: login,
      accountType,
      repositories: repositories.filter(isRecord).map((repo) => {
        const full = typeof repo.full_name === "string" ? repo.full_name : "";
        const [owner, name] = full.split("/");
        return {
          githubRepoId: String(repo.id ?? ""),
          owner: owner || login,
          name: typeof repo.name === "string" ? repo.name : name || "unknown",
          defaultBranch: "main",
          cloneUrl: null,
        };
      }),
    });
    return { status: 200, body: "installation stored" };
  }

  if (event !== "pull_request") return { status: 200, body: "ignored" };
  const action = typeof payload.action === "string" ? payload.action : "";
  if (action !== "opened" && action !== "synchronize" && action !== "reopened") {
    return { status: 200, body: "ignored" };
  }
  const pull = isRecord(payload.pull_request) ? payload.pull_request : null;
  const repository = isRecord(payload.repository) ? payload.repository : null;
  const installation = isRecord(payload.installation) ? payload.installation : null;
  if (!pull || !repository || typeof pull.number !== "number") return { status: 200, body: "ignored" };

  const full = typeof repository.full_name === "string" ? repository.full_name : "";
  const [owner, name] = full.split("/");
  const repoName = typeof repository.name === "string" ? repository.name : name;
  const repoOwner = owner || "unknown";
  if (!repoName) return { status: 200, body: "ignored" };

  const githubInstallationId = installation && typeof installation.id === "number" ? String(installation.id) : null;
  const accountLogin = repoOwner;
  let installationRow = githubInstallationId
    ? await db().installation.findUnique({ where: { githubInstallationId } })
    : null;
  if (!installationRow && githubInstallationId) {
    installationRow = await db().installation.create({
      data: {
        githubInstallationId,
        accountLogin,
        accountType: "Organization",
      },
    });
  }
  if (!installationRow) return { status: 200, body: "no installation" };

  const defaultBranch = typeof repository.default_branch === "string" ? repository.default_branch : "main";
  const cloneUrl = typeof repository.clone_url === "string" ? repository.clone_url : null;
  const repoRow = await db().repository.upsert({
    where: {
      installationId_owner_name: {
        installationId: installationRow.id,
        owner: repoOwner,
        name: repoName,
      },
    },
    create: {
      installationId: installationRow.id,
      githubRepoId: String(repository.id ?? ""),
      owner: repoOwner,
      name: repoName,
      defaultBranch,
      cloneUrl,
      enabled: false,
    },
    update: {
      defaultBranch,
      cloneUrl,
      githubRepoId: String(repository.id ?? ""),
    },
  });

  const head = isRecord(pull.head) ? pull.head : {};
  const base = isRecord(pull.base) ? pull.base : {};
  const sha = typeof head.sha === "string" ? head.sha : "";
  const baseRef = typeof base.ref === "string" ? base.ref : "";
  const title = typeof pull.title === "string" ? pull.title : "";

  let diff: string | null = null;
  let diffError: string | null = null;
  if (repoRow.enabled && githubInstallationId && sha) {
    try {
      diff = await fetchPullDiff(repoOwner, repoName, pull.number, githubInstallationId);
    } catch (error) {
      diffError = error instanceof Error ? error.message : "Could not read the diff.";
    }
  }

  const result = await ingestPullRequest({
    repositoryId: repoRow.id,
    pullNumber: pull.number,
    headSha: sha || "0".repeat(40),
    title,
    baseRef,
    diff,
    diffError,
  });
  if (!result.ignored) kickCheck(result.checkId);
  return { status: 200, body: result.ignored ? result.reason : "queued" };
}
