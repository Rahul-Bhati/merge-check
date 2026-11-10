import fs from "fs";
import path from "path";
import { z } from "zod";
import type { FlowDraft, PickerResult, Step } from "./types";

const MAX_FLOWS = 8;

const stepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open") }),
  z.object({ action: z.literal("click"), target: z.string().min(1).max(80) }),
  z.object({ action: z.literal("expectText"), text: z.string().min(1).max(120) }),
]);

const flowSchema = z.object({
  name: z.string().min(1).max(80),
  url: z.string().url(),
  kind: z.enum(["main", "empty", "error", "other"]),
  reason: z.string().min(1).max(240),
  steps: z.array(stepSchema).min(1).max(6),
});

const modelSchema = z.object({
  flows: z.array(flowSchema).max(MAX_FLOWS),
  notes: z.array(z.string()).optional(),
  neutralReason: z.string().optional(),
});

export function changedFiles(diff: string): string[] {
  const files = new Set<string>();
  for (const match of diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) {
    const file = match[2] ?? match[1];
    if (file && !file.includes("node_modules/")) files.add(file.replace(/\\/g, "/"));
  }
  return [...files];
}

export function routeFromFile(file: string): string | null {
  const normalized = file.replace(/\\/g, "/");
  if (normalized.includes("/api/") || normalized.endsWith("/route.ts") || normalized.endsWith("/route.js")) {
    return null;
  }
  const app = normalized.match(/(?:^|\/)app\/(.+)\/page\.(tsx|ts|jsx|js)$/);
  if (app?.[1]) {
    const parts = app[1]
      .split("/")
      .filter((part) => part && !part.startsWith("(") && !part.startsWith("@"));
    return `/${parts.join("/")}`.replace(/\/$/, "") || "/";
  }
  if (/(?:^|\/)app\/page\.(tsx|ts|jsx|js)$/.test(normalized)) return "/";
  const pages = normalized.match(/(?:^|\/)pages\/(.+)\.(tsx|ts|jsx|js)$/);
  if (pages?.[1] && pages[1] !== "index" && !pages[1].startsWith("api/") && !pages[1].startsWith("_")) {
    return `/${pages[1].replace(/\/index$/, "")}`;
  }
  if (/(?:^|\/)pages\/index\.(tsx|ts|jsx|js)$/.test(normalized)) return "/";
  return null;
}

function titleFromRoute(route: string): string {
  const segment = route.split("/").filter(Boolean).pop() ?? "Home";
  const words = segment.replace(/[-_]/g, " ");
  return words.slice(0, 1).toUpperCase() + words.slice(1);
}

function joinUrl(origin: string, route: string, query?: string): string {
  const base = origin.replace(/\/$/, "");
  const pathName = route.startsWith("/") ? route : `/${route}`;
  return query ? `${base}${pathName}?${query}` : `${base}${pathName}`;
}

function importsOf(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    if (spec && (spec.startsWith(".") || spec.startsWith("@/"))) found.push(spec);
  }
  return found;
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

export function readWorkspace(workspaceDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const full of walkFiles(workspaceDir)) {
    const rel = path.relative(workspaceDir, full).replace(/\\/g, "/");
    files[rel] = fs.readFileSync(full, "utf8");
  }
  return files;
}

function hasEmptyState(source: string): boolean {
  return /empty|length\s*===\s*0|\.length\s*==\s*0|no\s+[a-z]/i.test(source);
}

function hasErrorState(source: string): boolean {
  return /catch|isError|could not|failed to load|error state/i.test(source);
}

function phrase(source: string, pattern: RegExp, fallback: string): string {
  const match = source.match(pattern);
  return match?.[0]?.trim() || fallback;
}

function stepsFor(kind: FlowDraft["kind"], title: string): Step[] {
  if (kind === "main") {
    return [{ action: "open" }, { action: "click", target: "Refresh" }, { action: "expectText", text: title }];
  }
  if (kind === "empty") return [{ action: "open" }, { action: "expectText", text: "No " }];
  if (kind === "error") return [{ action: "open" }, { action: "expectText", text: "Could not load" }];
  return [{ action: "open" }, { action: "expectText", text: title }];
}

export function pickHeuristic(input: {
  diff: string;
  files: Record<string, string>;
  previewOrigin: string;
}): PickerResult {
  const origin = input.previewOrigin.replace(/\/$/, "");
  const changed = changedFiles(input.diff);
  const routeFiles = changed
    .map((file) => ({ file, route: routeFromFile(file) }))
    .filter((item): item is { file: string; route: string } => Boolean(item.route));

  if (routeFiles.length === 0) {
    return {
      flows: [],
      notes: [],
      neutralReason: "No changed file maps to a Next.js page.",
      failed: false,
      prompt: null,
      raw: null,
    };
  }

  const flows: FlowDraft[] = [];
  const notes: string[] = [];
  const push = (flow: FlowDraft) => {
    if (flows.length >= MAX_FLOWS) return;
    flows.push(flow);
  };

  const primary = routeFiles[0];
  if (!primary) {
    return {
      flows: [],
      notes: [],
      neutralReason: "No changed file maps to a Next.js page.",
      failed: false,
      prompt: null,
      raw: null,
    };
  }
  const source = input.files[primary.file] ?? "";
  const title = titleFromRoute(primary.route);
  push({
    name: title,
    url: joinUrl(origin, primary.route),
    kind: "main",
    reason: `${primary.file} changed`,
    steps: stepsFor("main", title),
  });

  if (hasEmptyState(source)) {
    push({
      name: `${title} empty`,
      url: joinUrl(origin, primary.route, "empty=1"),
      kind: "empty",
      reason: `${primary.file} can render with nothing to show`,
      steps: [{ action: "open" }, { action: "expectText", text: phrase(source, /No\s+[A-Za-z][^.<\n]{0,40}/, "No ") }],
    });
  } else {
    notes.push("No empty state found in this screen.");
  }

  if (hasErrorState(source)) {
    push({
      name: `${title} failed to load`,
      url: joinUrl(origin, primary.route, "error=1"),
      kind: "error",
      reason: `${primary.file} can fail its load`,
      steps: [{ action: "open" }, { action: "expectText", text: phrase(source, /Could not load[^.<\n]{0,40}/i, "Could not load") }],
    });
  } else {
    notes.push("No error state found in this screen.");
  }

  const shared = new Set(importsOf(source));
  let other: { file: string; route: string } | null = null;
  if (shared.size > 0) {
    for (const [file, text] of Object.entries(input.files)) {
      if (file === primary.file) continue;
      const route = routeFromFile(file);
      if (!route || route === primary.route) continue;
      const specs = importsOf(text);
      if (specs.some((spec) => shared.has(spec))) {
        other = { file, route };
        break;
      }
    }
  }
  if (other) {
    const otherTitle = titleFromRoute(other.route);
    push({
      name: otherTitle,
      url: joinUrl(origin, other.route),
      kind: "other",
      reason: `${other.file} reads the same module as ${primary.file}`,
      steps: stepsFor("other", otherTitle),
    });
  } else {
    notes.push("No other route reads the same state.");
  }

  for (const extra of routeFiles.slice(1)) {
    push({
      name: titleFromRoute(extra.route),
      url: joinUrl(origin, extra.route),
      kind: "main",
      reason: `${extra.file} changed`,
      steps: stepsFor("main", titleFromRoute(extra.route)),
    });
  }

  return {
    flows,
    notes,
    neutralReason: null,
    failed: false,
    prompt: null,
    raw: null,
  };
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

export function parseModelFlows(raw: string, previewOrigin: string): PickerResult {
  const origin = previewOrigin.replace(/\/$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    throw new Error("Picker returned text that is not JSON.");
  }
  const result = modelSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Picker JSON did not match the flow list.");
  }
  for (const flow of result.data.flows) {
    if (!flow.url.startsWith(origin)) {
      throw new Error("Picker returned a URL outside the preview host.");
    }
  }
  return {
    flows: result.data.flows,
    notes: result.data.notes ?? [],
    neutralReason: result.data.flows.length === 0 ? result.data.neutralReason ?? "The picker found no user-visible flow." : null,
    failed: false,
    prompt: null,
    raw,
  };
}

function promptFor(input: { diff: string; files: Record<string, string>; previewOrigin: string }): string {
  const routes = Object.keys(input.files)
    .map((file) => ({ file, route: routeFromFile(file) }))
    .filter((item) => item.route);
  return [
    "Choose at most 8 user-visible flows for this pull request.",
    "Return JSON only: {\"flows\":[{\"name\":\"\",\"url\":\"\",\"kind\":\"main|empty|error|other\",\"reason\":\"\",\"steps\":[{\"action\":\"open\"}]}],\"notes\":[],\"neutralReason\":\"\"}",
    "Steps may only be open, click with target, or expectText with text. No shell.",
    "URLs must start with the preview origin.",
    "Include the main path. Include empty and error only when the screen can show them. Include one other route only when it reads the same state.",
    "If nothing user-visible changed, return an empty flows array and a neutralReason.",
    `Preview origin: ${input.previewOrigin}`,
    `Routes: ${JSON.stringify(routes)}`,
    `Diff:\n${input.diff.slice(0, 12000)}`,
  ].join("\n\n");
}

async function callModel(prompt: string): Promise<string> {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error("No model key.");
  const base = (process.env.MODEL_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.MODEL_NAME ?? "gpt-4o-mini";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: "You only return JSON for a flow list. You do not click or suggest code changes." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`Model request failed (${response.status}).`);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Model returned an empty response.");
  return content;
}

export async function chooseFlows(input: {
  diff: string;
  files: Record<string, string>;
  previewOrigin: string;
}): Promise<PickerResult> {
  if (!process.env.MODEL_API_KEY) {
    return pickHeuristic(input);
  }
  const prompt = promptFor(input);
  let last = "Picker failed.";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await callModel(prompt);
      const parsed = parseModelFlows(raw, input.previewOrigin);
      return { ...parsed, prompt, raw };
    } catch (error) {
      last = error instanceof Error ? error.message : "Picker failed.";
    }
  }
  return {
    flows: [],
    notes: [],
    neutralReason: null,
    failed: true,
    prompt,
    raw: last,
  };
}
