import type { ArticleFeedbackCategory, ArticleFeedbackImportance } from "@/features/article/feedback/articleFeedback";

export type SubmissionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; details: string[] };

export type FeedbackDraft = {
  category: ArticleFeedbackCategory;
  importance: ArticleFeedbackImportance;
  details: string;
  source_url: string;
  contact_email: string;
  website: string;
};

export function createInitialDraft(): FeedbackDraft {
  return {
    category: "inaccurate",
    importance: "normal",
    details: "",
    source_url: "",
    contact_email: "",
    website: "",
  };
}
