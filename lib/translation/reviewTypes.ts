/** Shared, browser-safe contracts for human translation review. */
export type ReviewScope = "ui" | "glossary" | "narrative";
export type ReviewSnapshot = { source: string; target: string; context: string; provenance?: "compiled" | "human" };
export type ReviewState = { revision: number; draft: ReviewSnapshot | null; approved: ReviewSnapshot | null };
export type ReviewEntry = ReviewState & { locale: string; scope: ReviewScope; sourceId: string; updatedAt: number };
export type ReviewAction = "save" | "approve" | "restore";
export type ReviewHistoryEntry = {
  revision: number;
  action: ReviewAction;
  before: ReviewState;
  after: ReviewState;
  actor: string;
  reason: string;
  createdAt: number;
};
export type ReviewMutation = {
  locale: string;
  scope: ReviewScope;
  sourceId: string;
  expectedRevision: number;
  action: ReviewAction;
  source: string;
  context: string;
  target?: string;
  restoreRevision?: number;
  actor: string;
  reason: string;
};
