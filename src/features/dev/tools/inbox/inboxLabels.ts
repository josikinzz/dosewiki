import type { InboxSourceId } from "./inboxModel";
import type { InboxDecision } from "./inboxSources";

export type PendingAction = "claim" | "release" | "takeover" | "undo" | InboxDecision;

export const DECISION_LABEL: Record<InboxSourceId, Record<InboxDecision, string>> = {
  "trip-reports": { accept: "Accept", reject: "Reject", spam: "Mark as spam" },
  "article-feedback": { accept: "Resolve", reject: "Reject", spam: "Mark as spam" },
  "site-feedback": { accept: "Resolve", reject: "Reject", spam: "Mark as spam" },
  "glossary-feedback": { accept: "Resolve", reject: "Reject", spam: "Mark as spam" },
  citations: { accept: "Approve", reject: "Reject", spam: "Mark as spam" },
  proposals: { accept: "Approve", reject: "Reject", spam: "Mark as spam" },
  "review-recommendations": { accept: "Approve", reject: "Reject", spam: "Mark as spam" },
};

export const PENDING_LABEL: Record<InboxSourceId, Record<PendingAction, string>> = Object.fromEntries(
  Object.entries(DECISION_LABEL).map(([source, labels]) => [
    source,
    {
      claim: "Claiming",
      release: "Releasing",
      takeover: "Taking over",
      undo: "Undoing",
      accept: labels.accept === "Accept" ? "Accepting" : labels.accept === "Resolve" ? "Resolving" : "Approving",
      reject: "Rejecting",
      spam: "Marking as spam",
    },
  ]),
) as Record<InboxSourceId, Record<PendingAction, string>>;

export const DECISION_KEY: Record<InboxDecision, string> = { accept: "a", reject: "r", spam: "s" };

export const SOURCE_ICON: Record<InboxSourceId, string> = {
  "trip-reports": "lucide:notebook-pen",
  "article-feedback": "lucide:message-square-text",
  "site-feedback": "lucide:message-square-text",
  "glossary-feedback": "lucide:languages",
  citations: "lucide:quote",
  proposals: "lucide:git-pull-request-arrow",
  "review-recommendations": "lucide:git-pull-request-arrow",
};

export const NOUN: Record<string, string> = {
  "trip-reports": "trip reports",
  feedback: "feedback",
  proposals: "proposals",
  citations: "citation articles",
  "glossary-feedback": "glossary feedback",
  "review-recommendations": "review recommendations",
};

