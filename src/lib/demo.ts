import { db } from "./db";
import { ingestPullRequest, newSha } from "./pipeline";
import { encrypt } from "./secret";
import { seedProofRepo } from "./seed";

export const LEAK_VALUE = "LEAK-VALUE-merge-check-secret";

export const PASS_DIFF = `diff --git a/app/bookings/page.jsx b/app/bookings/page.jsx
--- a/app/bookings/page.jsx
+++ b/app/bookings/page.jsx
@@
+changed the bookings screen
`;

export const NEUTRAL_DIFF = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@
+docs only
`;

export async function createDemoCheck(scenario: "pass" | "fail" | "neutral"): Promise<string> {
  const repo = await seedProofRepo();
  const count = await db().check.count({ where: { repositoryId: repo.id } });
  let diff = PASS_DIFF;
  let title = "Proof: passing screens";
  let flagsJson: string | null = null;
  if (scenario === "neutral") {
    diff = NEUTRAL_DIFF;
    title = "Proof: no screen changed";
  }
  if (scenario === "fail") {
    flagsJson = JSON.stringify({ hideHeading: true, leak: LEAK_VALUE });
    title = "Proof: broken heading";
    await db().secret.upsert({
      where: { repositoryId_name: { repositoryId: repo.id, name: "LEAK_TOKEN" } },
      create: { repositoryId: repo.id, name: "LEAK_TOKEN", ciphertext: encrypt(LEAK_VALUE) },
      update: { ciphertext: encrypt(LEAK_VALUE) },
    });
  }
  const result = await ingestPullRequest({
    repositoryId: repo.id,
    pullNumber: count + 1,
    headSha: newSha(),
    title,
    baseRef: repo.defaultBranch,
    diff,
    flagsJson,
  });
  if (result.ignored) throw new Error(result.reason);
  return result.checkId;
}
