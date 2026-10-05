/**
 * View model for the Inbox (`/dev/inbox`): every item that waits on an admin,
 * from every intake tool, as one list. Each source adapter maps its own rows
 * to `InboxItem`; this module decides order, filters and claim state, so no
 * source has to know about the others.
 *
 * Pure: the tab owns fetching and React state.
 */
import type { IntakeStatus } from "@/features/intake/intakeStatus";

/** One owning tool's queue, as the Inbox reads it. */
export type InboxSourceId =
  | "trip-reports"
  | "article-feedback"
  | "site-feedback"
  | "glossary-feedback"
  | "citations"
  | "proposals"
  | "review-recommendations";

/**
 * The chips above the list. Feedback folds article and site together the way
 * the Feedback tool does; Change Review holds proposals and review
 * recommendations the way its tab does.
 */
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

/** The label each row carries as its source chip. */
export const SOURCE_LABEL: Record<InboxSourceId, string> = {
  "trip-reports": "Trip report",
  "article-feedback": "Article feedback",
  "site-feedback": "Site feedback",
  "glossary-feedback": "Glossary feedback",
  citations: "Citations",
  proposals: "Proposal",
  "review-recommendations": "Review recommendation",
};

/**
 * How soon an item needs a person. Feedback carries the reader's own
 * importance; citation articles with blocking rows are high; everything else
 * is normal, and a review recommendation the article has moved past is low
 * (it can only be dismissed, not approved).
 */
export type InboxUrgency = "critical" | "high" | "normal" | "low";

const URGENCY_RANK: Record<InboxUrgency, number> = { critical: 3, high: 2, normal: 1, low: 0 };

export const URGENCY_LABEL: Record<InboxUrgency, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export type InboxItem = {
  /** Unique across sources: `<source>:<id>`. */
  key: string;
  source: InboxSourceId;
  /** The owning tool's id for the row (submission id, feedback id, slug, proposal id). */
  id: string;
  title: string;
  subtitle: string;
  /** The shared intake word (docs/glossary.md, Intake Status). */
  status: IntakeStatus;
  urgency: InboxUrgency;
  /** When the item started waiting; the age the list sorts by. */
  receivedAt: string;
  /** The admin working the item; null when nobody has claimed it. */
  claimedBy: string | null;
  /**
   * Who held a claim that expired untouched; the item reads as unclaimed and
   * anyone may claim it. Absent when there is no expired claim.
   */
  expiredClaimBy?: string;
  /** The owning tool's view of this item. */
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

/**
 * Most urgent first; within one urgency the item that has waited longest
 * comes first. Ties fall back to the key so the order is stable across loads.
 */
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

/**
 * Whether a row belongs under a source chip. Under All, citation rows can be
 * held back: they outnumber everything a person sent in many times over and
 * bury it. Picking the Citations chip always shows them.
 */
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

/** How many items each assignment view would show under the current source chip. */
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

/**
 * The pill tone for an urgency, one rule for rows and the pane: critical is
 * danger, high is caution (the Feedback tool's own tones), low steps back.
 * Normal draws no pill.
 */
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

/** What one part of the Inbox read said when it failed. */
export type InboxLoadFailure = { source: string; message: string };

const TRAILING_TRY_AGAIN = /\s*Try again\.?\s*$/i;

/** "A", "A and B", "A, B and C". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * One error for one read: the Inbox loads every queue at once, so every
 * failure folds into a single title and message with a single retry.
 * `everyQueueFailed` is true when no queue answered at all.
 */
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
