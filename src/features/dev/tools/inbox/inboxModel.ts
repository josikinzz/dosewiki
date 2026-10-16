import type { IntakeStatus } from "@/features/intake/intakeStatus";

export type InboxSourceId =
  | "trip-reports"
  | "article-feedback"
  | "site-feedback"
  | "glossary-feedback"
  | "citations"
  | "proposals"
  | "review-recommendations";

export type InboxChip = "trip-reports" | "feedback" | "glossary" | "citations" | "change-review";

export const INBOX_CHIPS: readonly { value: InboxChip; label: string }[] = [
  { value: "trip-reports", label: "Trip reports" },
  { value: "feedback", label: "Feedback" },
  { value: "glossary", label: "Glossary" },
  { value: "citations", label: "Citations" },
  { value: "change-review", label: "Change Review" },
];

export const CHIP_OF_SOURCE: Record<InboxSourceId, InboxChip> = {
  "trip-reports": "trip-reports",
  "article-feedback": "feedback",
  "site-feedback": "feedback",
  "glossary-feedback": "glossary",
  citations: "citations",
  proposals: "change-review",
  "review-recommendations": "change-review",
};

export const SOURCE_LABEL: Record<InboxSourceId, string> = {
  "trip-reports": "Trip report",
  "article-feedback": "Article feedback",
  "site-feedback": "Site feedback",
  "glossary-feedback": "Glossary feedback",
  citations: "Citations",
  proposals: "Proposal",
  "review-recommendations": "Review recommendation",
};

export type InboxUrgency = "critical" | "high" | "normal" | "low";

const URGENCY_RANK: Record<InboxUrgency, number> = { critical: 3, high: 2, normal: 1, low: 0 };

export const URGENCY_LABEL: Record<InboxUrgency, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export type InboxItem = {
  key: string;
  source: InboxSourceId;
  id: string;
  title: string;
  subtitle: string;
  status: IntakeStatus;
  urgency: InboxUrgency;
  receivedAt: string;
  claimedBy: string | null;
  expiredClaimBy?: string;
  href: string;
};

export type InboxAssignment = "mine" | "unassigned" | "everyone";

export const INBOX_ASSIGNMENTS: readonly { value: InboxAssignment; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "unassigned", label: "Unassigned" },
  { value: "everyone", label: "Everyone" },
];

export function inboxKey(source: InboxSourceId, id: string): string {
  return `${source}:${id}`;
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

export function sortInboxItems(items: readonly InboxItem[]): InboxItem[] {
  return [...items].sort(
    (left, right) =>
      URGENCY_RANK[right.urgency] - URGENCY_RANK[left.urgency] ||
      time(left.receivedAt) - time(right.receivedAt) ||
      left.key.localeCompare(right.key),
  );
}

export function sameActor(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

export function matchesAssignment(item: InboxItem, assignment: InboxAssignment, actor: string | null): boolean {
  switch (assignment) {
    case "mine":
      return sameActor(item.claimedBy, actor);
    case "unassigned":
      return item.claimedBy === null;
    case "everyone":
      return true;
  }
}

function matchesChip(item: InboxItem, chip: InboxChip | null, hideCitations: boolean): boolean {
  const itemChip = CHIP_OF_SOURCE[item.source];
  return chip === null ? !(hideCitations && itemChip === "citations") : itemChip === chip;
}

export function filterInboxItems(
  items: readonly InboxItem[],
  {
    assignment,
    chip,
    actor,
    hideCitations = false,
  }: { assignment: InboxAssignment; chip: InboxChip | null; actor: string | null; hideCitations?: boolean },
): InboxItem[] {
  return items.filter((item) => matchesChip(item, chip, hideCitations) && matchesAssignment(item, assignment, actor));
}

export function countByChip(items: readonly InboxItem[]): Record<InboxChip, number> {
  const counts: Record<InboxChip, number> = {
    "trip-reports": 0,
    feedback: 0,
    glossary: 0,
    citations: 0,
    "change-review": 0,
  };
  for (const item of items) counts[CHIP_OF_SOURCE[item.source]] += 1;
  return counts;
}

export function countByAssignment(
  items: readonly InboxItem[],
  { chip, actor, hideCitations = false }: { chip: InboxChip | null; actor: string | null; hideCitations?: boolean },
): Record<InboxAssignment, number> {
  const counts: Record<InboxAssignment, number> = { mine: 0, unassigned: 0, everyone: 0 };
  for (const item of items) {
    if (!matchesChip(item, chip, hideCitations)) continue;
    for (const option of INBOX_ASSIGNMENTS) {
      if (matchesAssignment(item, option.value, actor)) counts[option.value] += 1;
    }
  }
  return counts;
}

export function urgencyTone(urgency: InboxUrgency): "danger" | "caution" | "neutral" | null {
  switch (urgency) {
    case "critical":
      return "danger";
    case "high":
      return "caution";
    case "low":
      return "neutral";
    case "normal":
      return null;
  }
}

export type InboxLoadFailure = { source: string; message: string };

const TRAILING_TRY_AGAIN = /\s*Try again\.?\s*$/i;

export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function describeLoadFailures(
  failures: readonly InboxLoadFailure[],
  everyQueueFailed: boolean,
): { what: string; message: string } | null {
  if (failures.length === 0) return null;
  const queues = failures.filter((failure) => failure.source !== "Claims");
  const claimsFailed = queues.length < failures.length;
  const messages = [...new Set(failures.map((failure) => failure.message.replace(TRAILING_TRY_AGAIN, "").trim()))]
    .filter(Boolean)
    .map((message) => (/[.!?]$/.test(message) ? message : `${message}.`));
  const consequences: string[] = [];
  if (everyQueueFailed) return { what: "the Inbox", message: messages.join(" ") };
  if (queues.length > 0) {
    consequences.push(`Items from ${joinWords(queues.map((failure) => failure.source))} are missing from the list below; everything else loaded.`);
  }
  if (claimsFailed) consequences.push("Until claims load, every item shows as unclaimed.");
  const what = everyQueueFailed
    ? "the Inbox"
    : queues.length > 0
      ? joinWords([...queues.map((failure) => failure.source), ...(claimsFailed ? ["claims"] : [])])
      : "who is working on what";
  return { what, message: [...messages, ...consequences].join(" ") };
}
