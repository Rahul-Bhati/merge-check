import type { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { shouldBill } from "./billing";
import { bootApp } from "./boot";
import { COMMENT_FOOTER, renderComment } from "./comment";
import { checkoutCommit, destroyWorkspace, materializeWorkspace } from "./checkout";
import { db } from "./db";
import { chooseFlows, readWorkspace } from "./picker";
import { decrypt, signValue } from "./secret";
import { redact } from "./redact";
import { syncGithub } from "./github";
import type { FlowDraft } from "./types";
import { walkFlows } from "./walk";

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
}

function tagLinks(checkId: string): { real: string; falseFail: string } {
  const realSig = signValue(`${checkId}:real`);
  const falseSig = signValue(`${checkId}:false`);
  return {
    real: `${baseUrl()}/tags?check=${checkId}&verdict=real&sig=${realSig}`,
    falseFail: `${baseUrl()}/tags?check=${checkId}&verdict=false&sig=${falseSig}`,
  };
}

async function isSuperseded(checkId: string): Promise<boolean> {
  const check = await db().check.findUnique({ where: { id: checkId } });
  if (!check) return true;
  if (check.conclusion === "cancelled" || check.cancelReason) return true;
  const newer = await db().check.findFirst({
    where: {
      repositoryId: check.repositoryId,
      pullNumber: check.pullNumber,
      createdAt: { gt: check.createdAt },
    },
  });
  return Boolean(newer);
}

async function secretValues(repositoryId: string): Promise<string[]> {
  const secrets = await db().secret.findMany({ where: { repositoryId } });
  return secrets.map((secret) => decrypt(secret.ciphertext)).filter((value) => value.length >= 4);
}

async function publish(checkId: string, commentBody: string, extra: Prisma.CheckUpdateInput = {}): Promise<void> {
  if (await isSuperseded(checkId)) return;
  const values = await secretValues(
    (await db().check.findUniqueOrThrow({ where: { id: checkId } })).repositoryId,
  );
  const body = redact(commentBody, values);
  if (!body.includes(COMMENT_FOOTER)) {
    throw new Error("Refusing to post a comment that can edit or omit the no-change line.");
  }
  await db().check.update({
    where: { id: checkId },
    data: { ...extra, commentBody: body },
  });
  try {
    await syncGithub(checkId);
  } catch (error) {
    console.error("GitHub sync failed", error instanceof Error ? error.message : error);
  }
}

export async function ingestPullRequest(input: {
  repositoryId: string;
  pullNumber: number;
  headSha: string;
  title: string;
  baseRef: string;
  diff: string | null;
  diffError?: string | null;
  sourcePath?: string | null;
  flagsJson?: string | null;
}): Promise<{ ignored: true; reason: string } | { ignored: false; checkId: string }> {
  const repo = await db().repository.findUnique({ where: { id: input.repositoryId } });
  if (!repo || !repo.enabled) return { ignored: true, reason: "Repository is not enabled." };
  if (input.baseRef !== repo.defaultBranch) {
    return { ignored: true, reason: "Pull request does not target the default branch." };
  }

  const previous = await db().check.findMany({
    where: { repositoryId: repo.id, pullNumber: input.pullNumber, status: { not: "completed" } },
  });
  for (const old of previous) {
    await db().check.update({
      where: { id: old.id },
      data: {
        status: "completed",
        conclusion: "cancelled",
        cancelReason: "A newer commit was pushed.",
        finishedAt: new Date(),
        billed: shouldBill(old.bootStarted, "cancelled"),
      },
    });
    await db().job.updateMany({
      where: { checkId: old.id, state: { in: ["pending", "running"] } },
      data: { state: "cancelled" },
    });
  }

  const priorComment = await db().check.findFirst({
    where: { repositoryId: repo.id, pullNumber: input.pullNumber, commentId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  const values = await secretValues(repo.id);
  const diffText = redact((input.diff ?? "").slice(0, 100000), values);
  const pending = renderComment({ phase: "pending" });
  const check = await db().check.create({
    data: {
      repositoryId: repo.id,
      pullNumber: input.pullNumber,
      headSha: input.headSha,
      title: input.title,
      status: input.diffError ? "completed" : "queued",
      conclusion: input.diffError ? "failure" : null,
      commentId: priorComment?.commentId ?? `local-${repo.id}-${input.pullNumber}`,
      commentBody: pending,
      diffText,
      sourcePath: input.sourcePath ?? null,
      flagsJson: input.flagsJson ?? null,
      errorSummary: input.diffError ?? null,
      finishedAt: input.diffError ? new Date() : null,
      billed: false,
      bootStarted: false,
      job: input.diffError ? undefined : { create: { state: "pending" } },
    },
  });

  const commentBody = input.diffError
    ? renderComment({
        phase: "done",
        conclusion: "failure",
        errorSummary: input.diffError,
        tagLinks: tagLinks(check.id),
      })
    : pending;
  if (commentBody !== pending) {
    await db().check.update({ where: { id: check.id }, data: { commentBody } });
  }
  try {
    await syncGithub(check.id);
  } catch (error) {
    console.error("GitHub sync failed", error instanceof Error ? error.message : error);
  }
  return { ignored: false, checkId: check.id };
}

async function loadFlows(checkId: string) {
  return db().flow.findMany({ where: { checkId }, orderBy: { position: "asc" } });
}

async function replaceFlows(checkId: string, flows: FlowDraft[]): Promise<void> {
  await db().flow.deleteMany({ where: { checkId } });
  for (const [position, flow] of flows.entries()) {
    await db().flow.create({
      data: {
        checkId,
        position,
        name: flow.name,
        url: flow.url,
        kind: flow.kind,
        reason: flow.reason,
        steps: JSON.stringify(flow.steps),
      },
    });
  }
}

export async function executeCheck(checkId: string): Promise<void> {
  const claimed = await db().job.updateMany({
    where: { checkId, state: "pending" },
    data: { state: "running" },
  });
  if (claimed.count !== 1) return;

  let workspace: string | null = null;
  let ownsWorkspace = false;
  let flagsFile: string | null = null;
  let stop: (() => Promise<void>) | null = null;
  const shouldStop = async () => isSuperseded(checkId);

  try {
    if (await shouldStop()) return;
    const check = await db().check.findUnique({
      where: { id: checkId },
      include: { repository: { include: { boot: true, secrets: true, installation: true } } },
    });
    if (!check) return;
    await db().check.update({ where: { id: checkId }, data: { status: "in_progress" } });

    const repo = check.repository;
    const boot = repo.boot;
    if (!boot) {
      await failCheck(checkId, "Boot settings are missing.");
      return;
    }

    const source = check.sourcePath || repo.localPath;
    if (check.flagsJson) {
      flagsFile = path.join(os.tmpdir(), `merge-check-flags-${check.id}.json`);
      fs.writeFileSync(flagsFile, check.flagsJson);
    }
    if (repo.cloneUrl && !repo.localPath) {
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), "merge-check-git-"));
      ownsWorkspace = true;
      await checkoutCommit(repo.cloneUrl, check.headSha, workspace);
    } else if (repo.localPath) {
      workspace = repo.localPath;
    } else if (source) {
      workspace = materializeWorkspace(source, repo.localPath ?? undefined);
      ownsWorkspace = true;
    } else {
      await failCheck(checkId, "This repository has no checkout path.");
      return;
    }

    if (await shouldStop()) return;
    const files = readWorkspace(workspace);
    const origin = new URL(boot.previewUrl).origin;
    const picked = await chooseFlows({
      diff: check.diffText,
      files,
      previewOrigin: origin,
    });
    await db().check.update({
      where: { id: checkId },
      data: {
        pickerPrompt: picked.prompt,
        pickerResponse: picked.raw ?? JSON.stringify({ flows: picked.flows, notes: picked.notes, neutralReason: picked.neutralReason }),
      },
    });

    if (picked.failed) {
      await failCheck(checkId, picked.raw ?? "Could not choose flows.");
      return;
    }
    if (picked.flows.length === 0) {
      await publish(checkId, renderComment({ phase: "done", conclusion: "neutral", neutralReason: picked.neutralReason }), {
        status: "completed",
        conclusion: "neutral",
        billed: false,
        bootStarted: false,
        finishedAt: new Date(),
        errorSummary: picked.neutralReason,
      });
      return;
    }

    await replaceFlows(checkId, picked.flows);
    const chosen = await loadFlows(checkId);
    await publish(
      checkId,
      renderComment({
        phase: "chosen",
        flows: chosen,
        notes: picked.notes,
      }),
    );
    if (await shouldStop()) return;

    const deadline = Date.now() + repo.checkTimeoutMs;
    await db().check.update({
      where: { id: checkId },
      data: { bootStarted: true, billed: true, startedAt: new Date() },
    });

    let booted: Awaited<ReturnType<typeof bootApp>>;
    try {
      booted = await bootApp({
        cwd: workspace,
        installCommand: boot.installCommand,
        steps: JSON.parse(boot.steps) as string[],
        startCommand: boot.startCommand,
        previewUrl: boot.previewUrl,
        nodeVersion: boot.nodeVersion,
        secrets: repo.secrets.map((secret) => ({ name: secret.name, value: decrypt(secret.ciphertext) })),
        extraEnv: flagsFile ? { MERGE_CHECK_FLAGS: flagsFile } : undefined,
        deadline,
        shouldStop,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CANCELLED") return;
      await failCheck(checkId, error instanceof Error ? error.message : "Boot failed.", bootedLog(error));
      return;
    }
    stop = booted.stop;
    if (booted.origin !== origin) {
      const flows = await loadFlows(checkId);
      for (const flow of flows) {
        await db().flow.update({
          where: { id: flow.id },
          data: { url: flow.url.replace(origin, booted.origin) },
        });
      }
    }

    const values = repo.secrets.map((secret) => decrypt(secret.ciphertext));
    const walkFlowsNow = await loadFlows(checkId);
    const outcome = await walkFlows({
      flows: walkFlowsNow.map((flow) => ({ id: flow.id, url: flow.url, steps: flow.steps })),
      pageTimeoutMs: repo.pageLoadTimeoutMs,
      deadline,
      onUpdate: async (id, result) => {
        await db().flow.update({
          where: { id },
          data: {
            result: result.result,
            clickLog: redact(result.clickLog, values),
            failUrl: result.failUrl,
            lastAction: result.lastAction,
          },
        });
      },
    });

    if (await shouldStop()) return;
    const finalFlows = await loadFlows(checkId);
    const failed = outcome === "timeout" || finalFlows.some((flow) => flow.result === "fail");
    const summary = outcome === "timeout" ? "The check exceeded its time limit." : null;
    const conclusion = failed ? "failure" : "success";
    await publish(
      checkId,
      renderComment({
        phase: "done",
        flows: finalFlows,
        conclusion,
        errorSummary: summary,
        tagLinks: conclusion === "failure" ? tagLinks(checkId) : null,
      }),
      {
        status: "completed",
        conclusion,
        finishedAt: new Date(),
        errorSummary: summary,
        bootLog: redact(booted.log, values).slice(-40000),
        billed: shouldBill(true, conclusion),
      },
    );
  } catch (error) {
    if (await isSuperseded(checkId)) return;
    await failCheck(checkId, error instanceof Error ? error.message : "The check failed.");
  } finally {
    if (stop) await stop().catch(() => undefined);
    if (ownsWorkspace && workspace) destroyWorkspace(workspace);
    if (flagsFile) fs.rmSync(flagsFile, { force: true });
    await db().job.updateMany({
      where: { checkId, state: "running" },
      data: { state: "done" },
    });
  }
}

function bootedLog(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

async function failCheck(checkId: string, summary: string, bootLog?: string): Promise<void> {
  if (await isSuperseded(checkId)) return;
  const check = await db().check.findUnique({ where: { id: checkId } });
  if (!check) return;
  const values = await secretValues(check.repositoryId);
  const clean = redact(summary, values).slice(0, 2000);
  const flows = await loadFlows(checkId);
  await publish(
    checkId,
    renderComment({
      phase: "done",
      flows,
      conclusion: "failure",
      errorSummary: clean,
      tagLinks: tagLinks(checkId),
    }),
    {
      status: "completed",
      conclusion: "failure",
      finishedAt: new Date(),
      errorSummary: clean,
      bootLog: redact(bootLog ?? check.bootLog, values).slice(-40000),
      billed: shouldBill(check.bootStarted, "failure"),
    },
  );
}

export function kickCheck(checkId: string): void {
  void executeCheck(checkId).catch((error) => {
    console.error(error);
  });
}

export async function pollOnce(): Promise<boolean> {
  const job = await db().job.findFirst({ where: { state: "pending" }, orderBy: { createdAt: "asc" } });
  if (!job) return false;
  await executeCheck(job.checkId);
  return true;
}

export function newSha(): string {
  return randomBytes(20).toString("hex");
}
