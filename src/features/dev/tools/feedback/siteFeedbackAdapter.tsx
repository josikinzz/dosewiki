import {
  SITE_FEEDBACK_CATEGORY_LABELS,
  SITE_FEEDBACK_STATUS_TRANSITIONS,
  SITE_FEEDBACK_URGENCY_LABELS,
  type SiteFeedbackRow,
  type SiteFeedbackUrgency,
} from "@/features/site-feedback/siteFeedback";
import { EditorStatusPill, type EditorStatusPillTone } from "@/features/dev/components";
import {
  FeedbackMetadataItem,
  FeedbackStatusPill,
  formatFeedbackDate,
  type FeedbackSourceAdapter,
} from "./FeedbackReviewQueue";
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
  | "created_at"
>;

const URGENCY_PILL_TONE: Record<SiteFeedbackUrgency, EditorStatusPillTone> = {
  critical: "danger",
  high: "caution",
  normal: "info",
  low: "neutral",
};

export const siteFeedbackAdapter: FeedbackSourceAdapter<SiteFeedbackQueueItem> = {
  source: "site",
  ...createFeedbackRequests<SiteFeedbackQueueItem>("/api/site-feedback"),
  transitions: SITE_FEEDBACK_STATUS_TRANSITIONS,
  labels: {
    icon: "lucide:megaphone",
    title: "Site Feedback",
    description: "General site feedback from readers: requests, bugs, design, performance, and accessibility reports.",
    emptyQueue: "No site feedback yet.",
    itemTitle: (row) => SITE_FEEDBACK_CATEGORY_LABELS[row.category],
    itemSubtitle: (row) => (row.urgency ? SITE_FEEDBACK_URGENCY_LABELS[row.urgency] : null),
    transitioned: (row, statusLabel) =>
      `Moved ${SITE_FEEDBACK_CATEGORY_LABELS[row.category].toLowerCase()} feedback to ${statusLabel}.`,
  },
  renderDetail: (row) => (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="theme-accent-heading text-xl font-semibold">
            {SITE_FEEDBACK_CATEGORY_LABELS[row.category]}
          </h3>
          {row.page ? (
            <p className="theme-text-muted mt-1 text-sm">
              <a
                href={row.page}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all hover:underline"
              >
                {row.page}
              </a>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.urgency ? (
            <EditorStatusPill tone={URGENCY_PILL_TONE[row.urgency]}>
              {SITE_FEEDBACK_URGENCY_LABELS[row.urgency]}
            </EditorStatusPill>
          ) : null}
          <FeedbackStatusPill status={row.status} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <FeedbackMetadataItem label="Received" value={formatFeedbackDate(row.created_at)} />
        <FeedbackMetadataItem label="Contact email" value={row.email} />
        <FeedbackMetadataItem label="Honeypot" value={row.honeypot_triggered ? "Triggered" : undefined} />
      </div>
    </>
  ),
};
