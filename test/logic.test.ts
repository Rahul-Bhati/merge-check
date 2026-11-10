import assert from "node:assert/strict";
import test from "node:test";
import { shouldBill } from "../src/lib/billing";
import { buildChildEnv } from "../src/lib/boot";
import { COMMENT_FOOTER, renderComment } from "../src/lib/comment";
import { assertGitAllowed } from "../src/lib/checkout";
import { signWebhook, verifyWebhook } from "../src/lib/github";
import { parseModelFlows, pickHeuristic } from "../src/lib/picker";
import { assertCannotPush, githubAppManifest } from "../src/lib/permissions";
import { redact } from "../src/lib/redact";
import { decrypt, encrypt } from "../src/lib/secret";

const bookings = `import { sample } from "../../lib/bookings";
export default function Page() {
  const items = sample;
  if (items.length === 0) return "No bookings yet";
  return "Could not load bookings";
}
`;

const diff = `diff --git a/app/bookings/page.tsx b/app/bookings/page.tsx
--- a/app/bookings/page.tsx
+++ b/app/bookings/page.tsx
@@
+changed
`;

test("permissions cannot push", () => {
  assert.doesNotThrow(() => assertCannotPush());
  const manifest = githubAppManifest("http://127.0.0.1:3000");
  const permissions = manifest.default_permissions as { contents: string };
  assert.equal(permissions.contents, "read");
  assert.equal("administration" in (manifest.default_permissions as object), false);
});

test("git push is refused", () => {
  assert.throws(() => assertGitAllowed("push"), /cannot change the repository/);
  assert.doesNotThrow(() => assertGitAllowed("fetch"));
});

test("billing follows boot, not neutral", () => {
  assert.equal(shouldBill(false, "failure"), false);
  assert.equal(shouldBill(false, "cancelled"), false);
  assert.equal(shouldBill(true, "neutral"), false);
  assert.equal(shouldBill(true, "cancelled"), true);
  assert.equal(shouldBill(true, "success"), true);
  assert.equal(shouldBill(true, "failure"), true);
});

test("picker names the main, empty, error, and shared route", () => {
  const result = pickHeuristic({
    diff,
    files: {
      "app/bookings/page.tsx": bookings,
      "app/event-types/page.tsx": `import { sample } from "../../lib/bookings";\nexport default function Page(){return "Event types"}`,
    },
    previewOrigin: "http://127.0.0.1:4173",
  });
  assert.equal(result.failed, false);
  assert.equal(result.flows.length, 4);
  assert.deepEqual(result.flows.map((flow) => flow.kind), ["main", "empty", "error", "other"]);
  assert.equal(result.flows[0]?.steps.some((step) => step.action === "click"), true);
  assert.ok(result.flows.every((flow) => flow.url.startsWith("http://127.0.0.1:4173")));
});

test("markdown-only diff is not applicable", () => {
  const result = pickHeuristic({
    diff: "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@\n+docs\n",
    files: { "README.md": "docs" },
    previewOrigin: "http://127.0.0.1:4173",
  });
  assert.equal(result.flows.length, 0);
  assert.match(result.neutralReason ?? "", /no user-visible|No changed file/i);
});

test("picker caps the list at 8", () => {
  const files: Record<string, string> = {};
  let many = "";
  for (let i = 1; i <= 12; i += 1) {
    const file = `app/screen-${i}/page.tsx`;
    files[file] = `export default function Page(){return "Screen ${i}"}`;
    many += `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@\n+x\n`;
  }
  const result = pickHeuristic({ diff: many, files, previewOrigin: "http://127.0.0.1:4173" });
  assert.equal(result.flows.length, 8);
  assert.ok(result.notes.includes("No empty state found in this screen."));
});

test("model output off the preview host is rejected", () => {
  assert.throws(
    () =>
      parseModelFlows(
        JSON.stringify({
          flows: [{ name: "Elsewhere", url: "http://evil.example/bookings", kind: "main", reason: "no", steps: [{ action: "open" }] }],
        }),
        "http://127.0.0.1:4173",
      ),
    /outside the preview host/,
  );
});

test("comment always says the branch is unchanged", () => {
  const pending = renderComment({ phase: "pending" });
  const neutral = renderComment({ phase: "done", conclusion: "neutral", neutralReason: "No screen." });
  const failure = renderComment({
    phase: "done",
    conclusion: "failure",
    flows: [{ name: "Bookings", kind: "main", reason: "changed", result: "fail", failUrl: "http://127.0.0.1:4173/bookings", lastAction: "click", clickLog: "open" }],
    tagLinks: { real: "http://127.0.0.1:3000/tags?verdict=real", falseFail: "http://127.0.0.1:3000/tags?verdict=false" },
  });
  for (const body of [pending, neutral, failure]) {
    assert.ok(body.endsWith(COMMENT_FOOTER));
    assert.ok(body.includes("<!-- merge-check -->"));
  }
  assert.match(failure, /Real break/);
  assert.doesNotMatch(neutral, /Real break/);
});

test("secrets round-trip and are redacted", () => {
  const cipher = encrypt("super-secret-value");
  assert.equal(decrypt(cipher), "super-secret-value");
  assert.equal(redact("saw super-secret-value in the log", ["super-secret-value"]), "saw [redacted] in the log");
  assert.match(redact("https://user:hunter2-pass@github.com/a/b", []), /\[redacted\]/);
});

test("child env gets repo secrets and not the app secret", () => {
  const env = buildChildEnv([{ name: "DATABASE_URL", value: "postgres://local/db" }], 4173, "next dev");
  assert.equal(env.DATABASE_URL, "postgres://local/db");
  assert.equal(env.PORT, "4173");
  assert.equal(env.APP_SECRET, undefined);
  assert.equal(env.NODE_ENV, "development");
  assert.throws(() => buildChildEnv([{ name: "bad-name", value: "nope-value" }], 1, "next dev"));
});

test("webhook signatures", () => {
  const body = JSON.stringify({ ok: true });
  const header = signWebhook("topsecret", body);
  assert.equal(verifyWebhook("topsecret", body, header), true);
  assert.equal(verifyWebhook("topsecret", body, "sha256=nope"), false);
  assert.equal(verifyWebhook("topsecret", body, null), false);
});
