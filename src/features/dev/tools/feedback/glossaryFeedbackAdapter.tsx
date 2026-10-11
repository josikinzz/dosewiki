import { SITE_FEEDBACK_STATUS_TRANSITIONS } from "@/features/site-feedback/siteFeedback";

import { FeedbackFacts, formatReceived } from "./FeedbackFacts";
import { createFeedbackRequests } from "./feedbackRequests";
import {
  type FeedbackQueueItem,
  type FeedbackSourceAdapter,
} from "./FeedbackReviewQueue";
export type GlossaryFeedbackItem = FeedbackQueueItem & {
  locale: string;
  term: string;
  target: string;
  version: string;
  alternative: string;
};
export function glossaryFeedbackAdapter(
  locale: string,
): FeedbackSourceAdapter<GlossaryFeedbackItem> {
  // The glossary queue is per locale; the shared client validates its shape.
  const requests = createFeedbackRequests<GlossaryFeedbackItem>(
    "/api/glossary-feedback",
    { listUrl: `/api/glossary-feedback/queue?locale=${encodeURIComponent(locale)}` },
  );
  return {
    source: "glossary",
    ...requests,
    transitions: SITE_FEEDBACK_STATUS_TRANSITIONS,
    labels: {
      icon: "lucide:book-open-text",
      title: "Glossary feedback",
      description:
        "Private submissions about this language. Review decisions do not approve or edit translations.",
      emptyQueue: "No glossary feedback yet.",
      noun: "glossary feedback",
      itemTitle: (row) => row.term,
      itemSubtitle: (row) => row.locale,
      transitioned: (row, label) => `${row.term}: ${label}.`,
    },
    renderDetail: (row) => (
      <FeedbackFacts
        facts={[
          {
            label: "Reviewed translation",
            value: (
              row.target ? (
                <bdi lang={row.locale} dir={row.locale === "ar" ? "rtl" : "auto"}>
                  {row.target}
                </bdi>
              ) : (
                "Not translated yet"
              )
            ),
          },
          row.alternative
            ? {
                label: "Suggested alternative",
                value: (
                  <bdi lang={row.locale} dir="auto">
                    {row.alternative}
                  </bdi>
                ),
              }
            : null,
          { label: "Received", value: formatReceived(row.created_at) },
          { label: "Term version", value: <span className="theme-text-muted break-all text-xs">{row.version}</span>, wide: true },
        ]}
      />
    ),
  };
}
