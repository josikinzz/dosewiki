export type AgentReviewFlagInput = {
  label: string;
  severity: "major" | "minor" | "note";
  note: string;
  section?: string;
};
export type HumanReviewFlagInput = AgentReviewFlagInput;
export type ReviewFlagIdentity = Pick<StoredReviewFlag, "created_at" | "label" | "source">;

export type StoredReviewFlag = AgentReviewFlagInput & {
  source: "agent" | "human";
  run_id?: string;
  created_at: string;
  created_by?: string;
};

const AGENT_FLAG_INPUT_KEYS = new Set(["label", "severity", "note", "section"]);
const SEVERITIES = new Set(["major", "minor", "note"]);
const SECTION_IDS = new Set([
  "overview", "classification", "summary", "dosage-duration",
  "subjective-effects", "reagent-testing", "pharmacology", "interactions",
  "tolerance", "harm-potential", "history-culture", "trip-reports", "legality", "sources",
  "citations", "editorial-review",
]);

export function assertAgentReviewFlagInput(value: unknown): asserts value is AgentReviewFlagInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Review Flag must be an object.");
  }
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).find((key) => !AGENT_FLAG_INPUT_KEYS.has(key));
  if (unexpected) {
    throw new Error(`Agent Review Flag cannot include ${unexpected}.`);
  }
  const words = typeof record.label === "string"
    ? record.label.trim().split(/\s+/).filter(Boolean)
    : [];
  if (words.length < 1 || words.length > 3) {
    throw new Error("Flag label must contain 1–3 words.");
  }
  if (!SEVERITIES.has(record.severity as string)) {
    throw new Error("Flag severity must be major, minor, or note.");
  }
  if (typeof record.note !== "string") {
    throw new Error("Flag note must be a string.");
  }
  if (record.section !== undefined && !SECTION_IDS.has(record.section as string)) {
    throw new Error("Flag section must be a canonical Substance section when present.");
  }
}

export function replaceAgentReviewFlags(
  existingFlags: readonly StoredReviewFlag[],
  agentFlags: readonly AgentReviewFlagInput[],
  runId: string,
  createdAt: string,
): StoredReviewFlag[] {
  for (const flag of agentFlags) assertAgentReviewFlagInput(flag);
  return [
    ...existingFlags.filter((flag) => flag.source === "human"),
    ...agentFlags.map((flag) => ({
      ...flag,
      source: "agent" as const,
      run_id: runId,
      created_at: createdAt,
    })),
  ];
}

export function addHumanReviewFlag(
  existingFlags: readonly StoredReviewFlag[],
  input: HumanReviewFlagInput,
  createdAt: string,
  createdBy: string,
): StoredReviewFlag[] {
  assertAgentReviewFlagInput(input);
  return [...existingFlags, { ...input, source: "human", created_at: createdAt, created_by: createdBy }];
}

export function deleteReviewFlagByIdentity(
  existingFlags: readonly StoredReviewFlag[],
  identity: ReviewFlagIdentity,
): StoredReviewFlag[] {
  const index = existingFlags.findIndex((flag) =>
    flag.created_at === identity.created_at &&
    flag.label === identity.label &&
    flag.source === identity.source
  );
  if (index < 0) throw new Error("FLAG_NOT_FOUND");
  return [...existingFlags.slice(0, index), ...existingFlags.slice(index + 1)];
}

export function preserveEditorialReviewWithFlags(
  existing: Readonly<Record<string, unknown>>,
  flags: readonly StoredReviewFlag[],
): Record<string, unknown> {
  return { ...existing, flags: [...flags] };
}
