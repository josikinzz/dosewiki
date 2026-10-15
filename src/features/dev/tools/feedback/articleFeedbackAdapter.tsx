import {
  ARTICLE_FEEDBACK_CATEGORY_LABELS,
  ARTICLE_FEEDBACK_IMPORTANCE_LABELS,
  ARTICLE_FEEDBACK_STATUS_TRANSITIONS,
  type ArticleFeedbackRow,
} from "@/features/article/feedback/articleFeedback";

import { FeedbackCorrectionPanel } from "./FeedbackCorrectionPanel";
import { FeedbackFacts, formatReceived, readableAddress, readerScale } from "./FeedbackFacts";
import type { FeedbackSourceAdapter } from "./FeedbackReviewQueue";
import { feedbackReplyHref } from "./feedbackQueueModel";
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
  | "decision_log"
  | "created_at"
>;

export const articleFeedbackAdapter: FeedbackSourceAdapter<ArticleFeedbackQueueItem> = {
  source: "article",
  ...createFeedbackRequests<ArticleFeedbackQueueItem>("/api/article-feedback"),
  keepsDecisionLog: true,
  recordsOutcomes: true,
  renderCorrection: (row, onRowChange) => (
    <FeedbackCorrectionPanel<ArticleFeedbackQueueItem>
      feedbackId={row.id}
      slug={row.substance_slug}
      category={row.category}
      onLinked={onRowChange}
    />
  ),
  transitions: ARTICLE_FEEDBACK_STATUS_TRANSITIONS,
  importance: (row) => row.importance,
  labels: {
    icon: "lucide:message-square-plus",
    title: "Article feedback",
    description: "Private reports and edit suggestions readers send from an article page.",
    emptyQueue: "No article feedback yet.",
    noun: "article feedback",
    itemTitle: (row) => row.substance_title,
    itemSubtitle: (row) => ARTICLE_FEEDBACK_CATEGORY_LABELS[row.category],
    transitioned: (row, statusLabel) => `Moved feedback for "${row.substance_title}" to ${statusLabel}.`,
  },
  renderDetail: (row) => (
    <FeedbackFacts
      facts={[
        {
          label: "Article",
          value: `/${row.substance_slug}`,
          href: `/${row.substance_slug}`,
          hint: `, ${row.substance_title}, opens in a new tab`,
        },
        { label: "Reader rated it", value: readerScale(ARTICLE_FEEDBACK_IMPORTANCE_LABELS[row.importance]) },
        { label: "Received", value: formatReceived(row.created_at) },
        {
          label: "Contact",
          value: row.contact_email,
          href: row.contact_email
            ? feedbackReplyHref(row.contact_email, `Your dose.wiki feedback on ${row.substance_title}`, row.details)
            : undefined,
        },
        row.source_url
          ? { label: "Source they cite", value: readableAddress(row.source_url), href: row.source_url, hint: ", opens in a new tab", wide: true }
          : null,
        row.honeypot_triggered
          ? { label: "Spam trap", value: "Tripped: the form's hidden field was filled, as bots do", tone: "warning" as const, wide: true }
          : null,
      ]}
    />
  ),
};
