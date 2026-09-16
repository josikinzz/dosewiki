import {
  ARTICLE_FEEDBACK_CATEGORY_LABELS,
  ARTICLE_FEEDBACK_IMPORTANCE_LABELS,
  ARTICLE_FEEDBACK_STATUS_TRANSITIONS,
  type ArticleFeedbackRow,
} from "@/features/article/feedback/articleFeedback";

import { EditorStatusPill, type EditorStatusPillTone } from "@/features/dev/components";
import {
  FeedbackMetadataItem,
  FeedbackStatusPill,
  formatFeedbackDate,
  type FeedbackSourceAdapter,
} from "./FeedbackReviewQueue";
import { createFeedbackRequests } from "./feedbackRequests";

type ArticleFeedbackQueueItem = Pick<
  ArticleFeedbackRow,
  | "id"
  | "status"
  | "substance_slug"
  | "substance_title"
  | "category"
  | "importance"
  | "details"
  | "source_url"
  | "contact_email"
  | "honeypot_triggered"
  | "review_notes"
  | "reviewed_by"
  | "reviewed_at"
  | "created_at"
>;

const IMPORTANCE_PILL_TONE: Record<ArticleFeedbackRow["importance"], EditorStatusPillTone> = {
  critical: "danger",
  high: "caution",
  normal: "info",
  low: "neutral",
};

export const articleFeedbackAdapter: FeedbackSourceAdapter<ArticleFeedbackQueueItem> = {
  source: "article",
  ...createFeedbackRequests<ArticleFeedbackQueueItem>("/api/article-feedback"),
  transitions: ARTICLE_FEEDBACK_STATUS_TRANSITIONS,
  labels: {
    icon: "lucide:message-square-plus",
    title: "Article Feedback",
    description: "Private per-article issue reports and edit suggestions from readers.",
    emptyQueue: "No article feedback yet.",
    itemTitle: (row) => row.substance_title,
    itemSubtitle: (row) => ARTICLE_FEEDBACK_CATEGORY_LABELS[row.category],
    transitioned: (row, statusLabel) => `Moved feedback for "${row.substance_title}" to ${statusLabel}.`,
  },
  renderDetail: (row) => (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="theme-accent-heading text-xl font-semibold">
            <a
              href={`/${row.substance_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {row.substance_title}
            </a>
          </h3>
          <p className="theme-text-muted mt-1 text-sm">
            {ARTICLE_FEEDBACK_CATEGORY_LABELS[row.category]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <EditorStatusPill tone={IMPORTANCE_PILL_TONE[row.importance]}>
            {ARTICLE_FEEDBACK_IMPORTANCE_LABELS[row.importance]}
          </EditorStatusPill>
          <FeedbackStatusPill status={row.status} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <FeedbackMetadataItem label="Received" value={formatFeedbackDate(row.created_at)} />
        <FeedbackMetadataItem label="Contact email" value={row.contact_email} />
        <FeedbackMetadataItem label="Source URL" value={row.source_url} href={row.source_url} />
        <FeedbackMetadataItem label="Honeypot" value={row.honeypot_triggered ? "Triggered" : undefined} />
      </div>
    </>
  ),
};
