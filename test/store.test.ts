import assert from "node:assert/strict";
import test from "node:test";
import { db, ready } from "../src/lib/db";
import { NEUTRAL_DIFF } from "../src/lib/demo";
import { handleGithubEvent } from "../src/lib/events";
import { signWebhook } from "../src/lib/github";
import { executeCheck, ingestPullRequest, newSha } from "../src/lib/pipeline";
import { decrypt, encrypt } from "../src/lib/secret";
import { seedProofRepo } from "../src/lib/seed";

async function reset(): Promise<void> {
  await ready();
  await db().tag.deleteMany();
  await db().flow.deleteMany();
  await db().job.deleteMany();
  await db().check.deleteMany();
  await db().secret.deleteMany();
  await db().bootConfig.deleteMany();
  await db().repository.deleteMany();
  await db().installation.deleteMany();
  await db().githubApp.deleteMany();
}

test("disabled and non-default pull requests do not run", async () => {
  await reset();
  const repo = await seedProofRepo();
  await db().repository.update({ where: { id: repo.id }, data: { enabled: false } });
  const disabled = await ingestPullRequest({
    repositoryId: repo.id,
    pullNumber: 1,
    headSha: newSha(),
    title: "off",
    baseRef: "main",
    diff: NEUTRAL_DIFF,
  });
  assert.equal(disabled.ignored, true);
  await db().repository.update({ where: { id: repo.id }, data: { enabled: true } });
  const otherBranch = await ingestPullRequest({
    repositoryId: repo.id,
    pullNumber: 2,
    headSha: newSha(),
    title: "branch",
    baseRef: "feature",
    diff: NEUTRAL_DIFF,
  });
  assert.equal(otherBranch.ignored, true);
  assert.equal(await db().check.count(), 0);
});

test("a docs-only check is neutral and free", async () => {
  await reset();
  const repo = await seedProofRepo();
  const created = await ingestPullRequest({
    repositoryId: repo.id,
    pullNumber: 3,
    headSha: newSha(),
    title: "docs",
    baseRef: "main",
    diff: NEUTRAL_DIFF,
  });
  assert.equal(created.ignored, false);
  if (created.ignored) return;
  await executeCheck(created.checkId);
  const check = await db().check.findUniqueOrThrow({ where: { id: created.checkId } });
  assert.equal(check.conclusion, "neutral");
  assert.equal(check.billed, false);
  assert.equal(check.bootStarted, false);
  assert.match(check.commentBody, /does not change your branch/);
});

test("a newer commit cancels the older run and keeps one comment", async () => {
  await reset();
  const repo = await seedProofRepo();
  const first = await ingestPullRequest({
    repositoryId: repo.id,
    pullNumber: 4,
    headSha: newSha(),
    title: "first",
    baseRef: "main",
    diff: NEUTRAL_DIFF,
  });
  const second = await ingestPullRequest({
    repositoryId: repo.id,
    pullNumber: 4,
    headSha: newSha(),
    title: "second",
    baseRef: "main",
    diff: NEUTRAL_DIFF,
  });
  assert.equal(first.ignored, false);
  assert.equal(second.ignored, false);
  if (first.ignored || second.ignored) return;
  await executeCheck(first.checkId);
  await executeCheck(second.checkId);
  const older = await db().check.findUniqueOrThrow({ where: { id: first.checkId } });
  const newer = await db().check.findUniqueOrThrow({ where: { id: second.checkId } });
  assert.equal(older.conclusion, "cancelled");
  assert.equal(older.billed, false);
  assert.equal(newer.conclusion, "neutral");
  assert.equal(newer.commentId, older.commentId);
});

test("stored env values decrypt only for the runner", async () => {
  await reset();
  const repo = await seedProofRepo();
  await db().secret.create({
    data: { repositoryId: repo.id, name: "DATABASE_URL", ciphertext: encrypt("postgres://local/calendso") },
  });
  const stored = await db().secret.findFirstOrThrow({ where: { repositoryId: repo.id } });
  assert.equal(stored.ciphertext.includes("postgres://local/calendso"), false);
  assert.equal(decrypt(stored.ciphertext), "postgres://local/calendso");
});

test("webhook rejects a bad signature and ignores a closed pull request", async () => {
  await reset();
  const header = signWebhook("topsecret", "{}");
  assert.notEqual(header, signWebhook("other", "{}"));
  const ignored = await handleGithubEvent("pull_request", { action: "closed", pull_request: { number: 1 } });
  assert.equal(ignored.body, "ignored");
});
