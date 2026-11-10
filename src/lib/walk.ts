import type { Step } from "./types";

export type WalkResult = {
  result: "pass" | "fail";
  clickLog: string;
  failUrl: string | null;
  lastAction: string | null;
};

async function launchBrowser(chromium: {
  launch: (options: { headless: boolean; channel?: "chrome" | "msedge" }) => Promise<import("playwright").Browser>;
}) {
  try {
    return await chromium.launch({ headless: true });
  } catch (bundledError) {
    for (const channel of ["chrome", "msedge"] as const) {
      try {
        return await chromium.launch({ headless: true, channel });
      } catch {
        /* This machine may have the other browser. */
      }
    }
    throw bundledError;
  }
}

function parseSteps(raw: string): Step[] {
  const parsed = JSON.parse(raw) as Step[];
  if (!Array.isArray(parsed)) throw new Error("Flow steps are not a list.");
  for (const step of parsed) {
    if (step.action !== "open" && step.action !== "click" && step.action !== "expectText") {
      throw new Error("Rejected a walker step that is not open, click, or expectText.");
    }
  }
  return parsed;
}

export async function walkFlows(input: {
  flows: Array<{ id: string; url: string; steps: string }>;
  pageTimeoutMs: number;
  deadline: number;
  onUpdate: (id: string, result: WalkResult) => Promise<void>;
}): Promise<"ok" | "timeout"> {
  const { chromium } = await import("playwright");
  const browser = await launchBrowser(chromium);
  try {
    for (const flow of input.flows) {
      if (Date.now() > input.deadline) {
        await input.onUpdate(flow.id, {
          result: "fail",
          clickLog: "The check exceeded its time limit.",
          failUrl: flow.url,
          lastAction: "check timeout",
        });
        return "timeout";
      }
      const steps = parseSteps(flow.steps);
      const context = await browser.newContext();
      const page = await context.newPage();
      const log: string[] = [];
      const consoleErrors: string[] = [];
      const badResponses: string[] = [];
      let lastAction = "open";
      page.on("pageerror", (error) => {
        consoleErrors.push(error.message);
      });
      page.on("response", (response) => {
        if (response.status() < 400) return;
        const url = response.url();
        if (/favicon/i.test(url)) return;
        badResponses.push(`${response.status()} ${url}`);
      });
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        const url = message.location().url ?? "";
        if (/favicon/i.test(text) || /favicon/i.test(url)) return;
        // Chromium logs favicon misses as a generic 404 with no URL. Real misses are recorded above.
        if (/Failed to load resource/i.test(text)) return;
        consoleErrors.push(text);
      });
      try {
        for (const step of steps) {
          if (step.action === "open") {
            lastAction = `open ${flow.url}`;
            log.push(lastAction);
            await page.goto(flow.url, {
              timeout: input.pageTimeoutMs,
              waitUntil: "domcontentloaded",
            });
          } else if (step.action === "click") {
            lastAction = `click "${step.target}"`;
            log.push(lastAction);
            await page.getByRole("button", { name: step.target }).click({ timeout: input.pageTimeoutMs });
          } else {
            lastAction = `see "${step.text}"`;
            log.push(lastAction);
            await page.getByText(step.text, { exact: false }).first().waitFor({
              state: "visible",
              timeout: input.pageTimeoutMs,
            });
          }
        }
        if (badResponses.length > 0) consoleErrors.push(...badResponses);
        if (consoleErrors.length > 0) {
          const text = await page.locator("body").innerText().catch(() => "");
          log.push(`page text: ${text.slice(0, 500)}`);
          await input.onUpdate(flow.id, {
            result: "fail",
            clickLog: `${log.join(" → ")} → console error: ${consoleErrors[0]}`,
            failUrl: page.url(),
            lastAction,
          });
        } else {
          await input.onUpdate(flow.id, {
            result: "pass",
            clickLog: log.join(" → "),
            failUrl: null,
            lastAction: null,
          });
        }
      } catch (error) {
        const text = await page.locator("body").innerText().catch(() => "");
        log.push(`page text: ${text.slice(0, 500)}`);
        const message = error instanceof Error ? error.message.split("\n")[0] : "flow failed";
        await input.onUpdate(flow.id, {
          result: "fail",
          clickLog: `${log.join(" → ")} → ${message ?? "flow failed"}`,
          failUrl: page.url(),
          lastAction,
        });
      } finally {
        await context.close();
      }
    }
    return "ok";
  } finally {
    await browser.close();
  }
}
