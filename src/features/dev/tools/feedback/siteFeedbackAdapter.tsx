import {
  SITE_FEEDBACK_CATEGORY_LABELS,
  SITE_FEEDBACK_STATUS_TRANSITIONS,
  SITE_FEEDBACK_URGENCY_LABELS,
  type SiteFeedbackRow,
} from "@/features/site-feedback/siteFeedback";

import { FeedbackFacts, formatReceived, readableAddress, readerScale } from "./FeedbackFacts";
import type { FeedbackSourceAdapter } from "./FeedbackReviewQueue";
import { feedbackReplyHref } from "./feedbackQueueModel";
import { createFeedbackRequests } from "./feedbackRequests";

type SiteFeedbackQueueItem = Pick<
  SiteFeedbackRow,
  | "id"
  | "status"
  | "category"
  | "urgency"
  | "details"
  | "page"
  | "email"
  | "honeypot_triggered"
  | "review_notes"
  | "reviewed_by"
  | "reviewed_at"
  | "decision_log"
  | "created_at"
>;

export const siteFeedbackAdapter: FeedbackSourceAdapter<SiteFeedbackQueueItem> = {
  source: "site",
  ...createFeedbackRequests<SiteFeedbackQueueItem>("/api/site-feedback"),
  keepsDecisionLog: true,
  transitions: SITE_FEEDBACK_STATUS_TRANSITIONS,
  importance: (row) => row.urgency,
  labels: {
    icon: "lucide:megaphone",
    title: "Site feedback",
    description: "Requests, bugs, design, performance and accessibility reports from the site feedback form.",
    emptyQueue: "No site feedback yet.",
    noun: "site feedback",
    itemTitle: (row) => SITE_FEEDBACK_CATEGORY_LABELS[row.category],
    itemSubtitle: () => null,
    transitioned: (row, statusLabel) =>
      `Moved ${SITE_FEEDBACK_CATEGORY_LABELS[row.category].toLowerCase()} feedback to ${statusLabel}.`,
  },
  renderDetail: (row) => (
    <FeedbackFacts
      facts={[
        row.page
          ? { label: "Page", value: readableAddress(row.page), href: row.page, hint: ", opens in a new tab" }
          : { label: "Page", value: "Not given" },
        row.urgency ? { label: "Reader rated it", value: readerScale(SITE_FEEDBACK_URGENCY_LABELS[row.urgency]) } : null,
        { label: "Received", value: formatReceived(row.created_at) },
        {
          label: "Contact",
          value: row.email,
          href: row.email
            ? feedbackReplyHref(
                row.email,
                `Your dose.wiki feedback: ${SITE_FEEDBACK_CATEGORY_LABELS[row.category].toLowerCase()}`,
                row.details,
              )
            : undefined,
        },
        row.honeypot_triggered
          ? { label: "Spam trap", value: "Tripped: the form's hidden field was filled, as bots do", tone: "warning" as const, wide: true }
          : null,
      ]}
    />
  ),
};
