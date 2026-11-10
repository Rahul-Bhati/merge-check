import { createHmac, createSign, timingSafeEqual } from "crypto";
import { db } from "./db";
import { decrypt, encrypt } from "./secret";

export type GithubCredentials = {
  appId: string;
  slug: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
};

export function signWebhook(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyWebhook(secret: string, body: string, header: string | null): boolean {
  if (!header) return false;
  const expected = signWebhook(secret, body);
  const left = Buffer.from(expected);
  const right = Buffer.from(header);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function appJwt(appId: string, pem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString("base64url");
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  return `${data}.${signer.sign(pem).toString("base64url")}`;
}

export async function githubCredentials(): Promise<GithubCredentials | null> {
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_WEBHOOK_SECRET && process.env.GITHUB_APP_PRIVATE_KEY_BASE64) {
    return {
      appId: process.env.GITHUB_APP_ID,
      slug: process.env.GITHUB_APP_SLUG ?? "",
      privateKey: Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY_BASE64, "base64").toString("utf8"),
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    };
  }
  const row = await db().githubApp.findUnique({ where: { id: "default" } });
  if (!row) return null;
  return {
    appId: row.appId,
    slug: row.slug,
    privateKey: decrypt(row.privateKey),
    webhookSecret: decrypt(row.webhookSecret),
    clientId: row.clientId,
    clientSecret: row.clientSecret ? decrypt(row.clientSecret) : "",
  };
}

export async function saveGithubApp(input: {
  id: number;
  slug: string;
  name: string;
  pem: string;
  webhook_secret: string;
  client_id?: string;
  client_secret?: string;
}): Promise<void> {
  const data = {
    appId: String(input.id),
    slug: input.slug,
    name: input.name,
    privateKey: encrypt(input.pem),
    webhookSecret: encrypt(input.webhook_secret),
    clientId: input.client_id ?? "",
    clientSecret: input.client_secret ? encrypt(input.client_secret) : "",
  };
  await db().githubApp.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
}

async function githubFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "merge-check",
      ...(init?.headers ?? {}),
    },
  });
}

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function installationToken(installationId: string): Promise<string | null> {
  const creds = await githubCredentials();
  if (!creds) return null;
  const cached = tokenCache.get(installationId);
  if (cached && cached.exp > Date.now() + 15000) return cached.token;
  const jwt = appJwt(creds.appId, creds.privateKey);
  const response = await githubFetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    jwt,
    { method: "POST" },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { token: string; expires_at: string };
  tokenCache.set(installationId, {
    token: body.token,
    exp: new Date(body.expires_at).getTime(),
  });
  return body.token;
}

export async function fetchPullDiff(owner: string, repo: string, pullNumber: number, installationId: string): Promise<string> {
  const token = await installationToken(installationId);
  if (!token) throw new Error("Could not read the diff because the GitHub App is not connected.");
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
    headers: {
      Accept: "application/vnd.github.diff",
      Authorization: `Bearer ${token}`,
      "User-Agent": "merge-check",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`Could not read the diff (${response.status}).`);
  return response.text();
}

export async function syncGithub(checkId: string): Promise<void> {
  const creds = await githubCredentials();
  if (!creds) return;
  const check = await db().check.findUnique({
    where: { id: checkId },
    include: { repository: { include: { installation: true } } },
  });
  if (!check?.repository.installation.githubInstallationId) return;
  const token = await installationToken(check.repository.installation.githubInstallationId);
  if (!token) return;
  const owner = check.repository.owner;
  const repo = check.repository.name;
  const summary = check.commentBody.replace("<!-- merge-check -->\n", "").slice(0, 60000);
  const checkBody = {
    name: "Merge Check",
    head_sha: check.headSha,
    status: check.status === "completed" ? "completed" : "in_progress",
    ...(check.status === "completed" && check.conclusion
      ? { conclusion: check.conclusion === "neutral" ? "neutral" : check.conclusion }
      : {}),
    output: {
      title: "Merge Check",
      summary: summary || "Merge Check is walking the affected screens.",
    },
  };
  if (check.githubCheckRunId) {
    await githubFetch(`https://api.github.com/repos/${owner}/${repo}/check-runs/${check.githubCheckRunId}`, token, {
      method: "PATCH",
      body: JSON.stringify(checkBody),
    });
  } else if (/^[0-9a-f]{40}$/i.test(check.headSha)) {
    const created = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/check-runs`, token, {
      method: "POST",
      body: JSON.stringify(checkBody),
    });
    if (created.ok) {
      const body = (await created.json()) as { id: number };
      await db().check.update({ where: { id: checkId }, data: { githubCheckRunId: String(body.id) } });
    }
  }

  const marker = "<!-- merge-check -->";
  const issue = `https://api.github.com/repos/${owner}/${repo}/issues/${check.pullNumber}/comments`;
  if (!check.commentId || check.commentId.startsWith("local-")) {
    const listed = await githubFetch(`${issue}?per_page=100`, token);
    let existing: number | null = null;
    if (listed.ok) {
      const comments = (await listed.json()) as Array<{ id: number; body?: string }>;
      existing = comments.find((comment) => comment.body?.includes(marker))?.id ?? null;
    }
    if (existing) {
      await githubFetch(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${existing}`, token, {
        method: "PATCH",
        body: JSON.stringify({ body: check.commentBody }),
      });
      await db().check.update({ where: { id: checkId }, data: { commentId: String(existing) } });
    } else {
      const posted = await githubFetch(issue, token, {
        method: "POST",
        body: JSON.stringify({ body: check.commentBody }),
      });
      if (posted.ok) {
        const body = (await posted.json()) as { id: number };
        await db().check.update({ where: { id: checkId }, data: { commentId: String(body.id) } });
      }
    }
  } else {
    await githubFetch(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${check.commentId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ body: check.commentBody }),
    });
  }
}

export async function importInstallation(installationId: string): Promise<void> {
  const creds = await githubCredentials();
  if (!creds) throw new Error("GitHub App is not connected.");
  const jwt = appJwt(creds.appId, creds.privateKey);
  const response = await githubFetch(`https://api.github.com/app/installations/${installationId}`, jwt);
  if (!response.ok) throw new Error("Could not read that GitHub installation.");
  const installation = (await response.json()) as {
    id: number;
    account: { login: string; type: string };
  };
  const token = await installationToken(installationId);
  if (!token) throw new Error("Could not access that installation.");
  const reposResponse = await githubFetch("https://api.github.com/installation/repositories?per_page=100", token);
  if (!reposResponse.ok) throw new Error("Could not list repositories.");
  const body = (await reposResponse.json()) as {
    repositories: Array<{
      id: number;
      name: string;
      full_name: string;
      default_branch?: string;
      clone_url?: string;
    }>;
  };
  const { rememberInstallation } = await import("./installations");
  await rememberInstallation({
    githubInstallationId: String(installation.id),
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    repositories: body.repositories.map((repo) => ({
      githubRepoId: String(repo.id),
      owner: repo.full_name.split("/")[0] ?? installation.account.login,
      name: repo.name,
      defaultBranch: repo.default_branch ?? "main",
      cloneUrl: repo.clone_url ?? null,
    })),
  });
}
