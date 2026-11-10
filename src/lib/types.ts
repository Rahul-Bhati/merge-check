export type Step =
  | { action: "open" }
  | { action: "click"; target: string }
  | { action: "expectText"; text: string };

export type FlowKind = "main" | "empty" | "error" | "other";

export type FlowDraft = {
  name: string;
  url: string;
  kind: FlowKind;
  reason: string;
  steps: Step[];
};

export type PickerResult = {
  flows: FlowDraft[];
  notes: string[];
  neutralReason: string | null;
  failed: boolean;
  prompt: string | null;
  raw: string | null;
};
