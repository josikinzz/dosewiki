import type { ReviewState } from "@/schema/substance/editorial";
import { WRITE_FREEZE_CODE } from "../../components/writeFreeze";
import { REVIEW_STATUS_NAMES } from "./reviewStatusNames";

/**
 * Pure words for the review dock: what a refused review write means, what the
 * article's review stands at, and who may do what. The dock and the notes
 * panel read them; nothing here writes.
 */

/** The freeze sentence every editor surface uses for a refused write. */
export const REVIEW_FREEZE_COPY = "Writes are paused, so that was not saved.";

/** Why a review write came back refused, when the answer says. */
export type ReviewRefusalKind = "frozen" | "expired" | "forbidden" | "failed";

export interface ReviewRefusal {
  kind: ReviewRefusalKind;
  message: string;
}

/**
 * Words for a refused review write (the tick, a recommendation, a flag).
 * The freeze and a lapsed sign-in read the same everywhere; anything else
 * keeps the route's own sentence, or `fallback` when it sent none.
 */
export function describeReviewRefusal(status: number, payload: unknown, fallback: string): ReviewRefusal {
  const body = payload && typeof payload === "object" ? (payload as { error?: unknown; code?: unknown }) : null;
  if (status === 503 && body?.code === WRITE_FREEZE_CODE) return { kind: "frozen", message: REVIEW_FREEZE_COPY };
  if (status === 401) {
    return { kind: "expired", message: "Your sign-in has lapsed, so that was not saved. Sign in again in a new tab, then try again here." };
  }
  if (status === 403) {
    return { kind: "forbidden", message: typeof body?.error === "string" && body.error !== "Admin access required." ? body.error : "Only admins can mark an article reviewed." };
  }
  return { kind: "failed", message: typeof body?.error === "string" && body.error ? body.error : fallback };
}

/** A thrown refusal, so callers can keep the kind through a `catch`. */
export class ReviewWriteRefusal extends Error {
  readonly kind: ReviewRefusalKind;
  constructor(refusal: ReviewRefusal) {
    super(refusal.message);
    this.name = "ReviewWriteRefusal";
    this.kind = refusal.kind;
  }
}

/** The pill tone each review state takes, from the dock and the picker. */
export const REVIEW_STATE_TONE: Record<ReviewState, "success" | "info" | "warning" | "neutral"> = {
  completed: "success",
  stale: "info",
  in_progress: "warning",
  needed: "neutral",
};

export function reviewStateLabel(state: ReviewState): string {
  return REVIEW_STATUS_NAMES[state];
}

/** "9 of 22 reviewed, 13 to go", or "All 22 reviewed". */
export function describeProgress(reviewed: number, total: number): string {
  if (total > 0 && reviewed >= total) return `All ${total.toLocaleString()} reviewed`;
  return `${reviewed.toLocaleString()} of ${total.toLocaleString()} reviewed, ${(total - reviewed).toLocaleString()} to go`;
}

/**
 * What a role may do with the review, in one sentence for the dock. Admins
 * sign off; editors recommend; anyone else reads.
 */
export function describeReviewRole({
  canSignOff,
  canRecommend,
  recommendation,
}: {
  canSignOff: boolean;
  canRecommend: boolean;
  recommendation: "none" | "pending" | "stale" | null;
}): string | null {
  if (canSignOff) return null;
  if (!canRecommend) return "Only admins can sign off a review.";
  if (recommendation === "pending") return "Only admins can sign off a review. You recommended it; an admin approves it in Change Review.";
  if (recommendation === "stale") return "Only admins can sign off a review. The article changed after your recommendation, so read it again and recommend it again.";
  return "Only admins can sign off a review. Recommend reviewed asks an admin to approve it.";
}

/** Past-tense words for a status change, by the status it set. */
export function describeStatusChange(status: "completed" | "needed" | "in_progress", name: string): string {
  if (status === "completed") return `Marked ${name} reviewed.`;
  if (status === "in_progress") return `Held ${name}.`;
  return `Marked ${name} not reviewed.`;
}
