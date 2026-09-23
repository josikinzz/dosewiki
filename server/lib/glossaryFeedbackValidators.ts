import { v } from "../../lib/postgres/runtime/values";
export const glossaryFeedbackStatus = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("resolved"),
  v.literal("rejected"),
  v.literal("spam"),
);
export const glossaryReactionChoice = v.union(
  v.literal("right"),
  v.literal("improve"),
  v.literal("clear"),
);
export const glossarySnapshot = {
  locale: v.string(),
  term: v.string(),
  target: v.string(),
  version: v.string(),
};
export const glossaryFeedbackFields = {
  ...glossarySnapshot,
  id: v.string(),
  visitor: v.string(),
  details: v.string(),
  alternative: v.string(),
  status: glossaryFeedbackStatus,
  created_at: v.string(),
  review_notes: v.optional(v.string()),
  reviewed_by: v.optional(v.string()),
  reviewed_at: v.optional(v.string()),
};
export const glossaryReactionFields = {
  ...glossarySnapshot,
  id: v.string(),
  visitor: v.string(),
  choice: glossaryReactionChoice,
  created_at: v.number(),
};
