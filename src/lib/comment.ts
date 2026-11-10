export const COMMENT_MARKER = "<!-- merge-check -->";
export const COMMENT_FOOTER = "This check does not change your branch.";

export type CommentFlow = {
  name: string;
  kind: string;
  reason: string;
  result?: string;
  failUrl?: string | null;
  lastAction?: string | null;
  clickLog?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  main: "main path",
  empty: "empty state",
  error: "error state",
  other: "other route",
};

export function renderComment(input: {
  phase: "pending" | "chosen" | "done";
  flows?: CommentFlow[];
  notes?: string[];
  conclusion?: string | null;
  neutralReason?: string | null;
  errorSummary?: string | null;
  tagLinks?: { real: string; falseFail: string } | null;
}): string {
  const lines: string[] = [COMMENT_MARKER, "Merge Check", ""];

  if (input.phase === "pending") {
    lines.push("Merge Check is walking the affected screens.");
    lines.push("");
    lines.push(COMMENT_FOOTER);
    return lines.join("\n");
  }

  if (input.conclusion === "neutral") {
    lines.push("Not applicable");
    lines.push(input.neutralReason || "This diff has no user-visible flow.");
    lines.push("");
    lines.push(COMMENT_FOOTER);
    return lines.join("\n");
  }

  const flows = input.flows ?? [];
  lines.push("Flows");
  if (flows.length === 0) {
    lines.push("- None");
  } else {
    for (const flow of flows) {
      const kind = KIND_LABEL[flow.kind] ?? flow.kind;
      lines.push(`- ${flow.name} — ${kind} — ${flow.reason}`);
    }
  }
  if (input.notes && input.notes.length > 0) {
    lines.push("");
    lines.push("Notes");
    for (const note of input.notes) lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("Results");
  if (input.phase === "chosen") {
    lines.push("Walk in progress.");
  } else if (input.errorSummary && flows.every((flow) => flow.result !== "fail" && flow.result !== "pass")) {
    lines.push(input.errorSummary);
  } else {
    for (const flow of flows) {
      const result = flow.result === "pass" || flow.result === "fail" ? flow.result : "not run";
      lines.push(`- ${flow.name} — ${result}`);
      if (flow.result === "fail") {
        if (flow.failUrl) lines.push(`  URL: ${flow.failUrl}`);
        if (flow.lastAction) lines.push(`  Last action: ${flow.lastAction}`);
        if (flow.clickLog) lines.push(`  Click log: ${flow.clickLog}`);
      }
    }
    if (input.errorSummary) {
      lines.push("");
      lines.push(input.errorSummary);
    }
  }

  if (input.conclusion === "failure" && input.tagLinks) {
    lines.push("");
    lines.push(`[Real break](${input.tagLinks.real}) · [False fail](${input.tagLinks.falseFail})`);
  }

  lines.push("");
  lines.push(COMMENT_FOOTER);
  return lines.join("\n");
}
