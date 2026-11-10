import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { db, ready } from "../src/lib/db";
import { createDemoCheck, LEAK_VALUE } from "../src/lib/demo";
import { executeCheck } from "../src/lib/pipeline";
import { monthlyUsage } from "../src/lib/seed";

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

test("passing, failing, and not-applicable proofs", async () => {
  const modules = path.resolve("fixtures/next-preview/node_modules/next");
  assert.ok(fs.existsSync(modules), "Run npm run setup so the proof app has dependencies.");
  await reset();

  const neutralId = await createDemoCheck("neutral");
  await executeCheck(neutralId);
  const neutral = await db().check.findUniqueOrThrow({ where: { id: neutralId } });
  assert.equal(neutral.conclusion, "neutral");
  assert.equal(neutral.billed, false);

  const passId = await createDemoCheck("pass");
  await executeCheck(passId);
  const passed = await db().check.findUniqueOrThrow({
    where: { id: passId },
    include: { flows: { orderBy: { position: "asc" } } },
  });
  assert.equal(passed.conclusion, "success", passed.errorSummary ?? passed.bootLog);
  assert.equal(passed.billed, true);
  assert.ok(passed.flows.some((flow) => flow.kind === "other"));
  assert.ok(passed.flows.every((flow) => flow.result === "pass"));
  assert.match(passed.commentBody, /does not change your branch/);

  const failId = await createDemoCheck("fail");
  await executeCheck(failId);
  const failed = await db().check.findUniqueOrThrow({
    where: { id: failId },
    include: { flows: true },
  });
  assert.equal(failed.conclusion, "failure", failed.errorSummary ?? failed.bootLog);
  assert.equal(failed.billed, true);
  assert.ok(failed.flows.some((flow) => flow.result === "fail"));
  assert.equal(failed.commentBody.includes(LEAK_VALUE), false);
  assert.equal(failed.flows.some((flow) => flow.clickLog.includes(LEAK_VALUE)), false);
  assert.match(failed.commentBody, /\[redacted\]/);
  assert.match(failed.commentBody, /Real break/);
  assert.match(failed.commentBody, /does not change your branch/);

  const repoId = failed.repositoryId;
  const usage = await monthlyUsage(repoId);
  assert.equal(usage, 2);
  assert.ok(fs.existsSync(modules));
});
