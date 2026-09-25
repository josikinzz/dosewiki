import { SITE_FEEDBACK_STATUS_TRANSITIONS } from "@/features/site-feedback/siteFeedback";
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
      itemTitle: (row) => row.term,
      itemSubtitle: (row) => row.locale,
      transitioned: (row, label) => `${row.term}: ${label}.`,
    },
    renderDetail: (row) => (
      <dl className="space-y-2">
        <dt className="font-semibold">Reviewed translation</dt>
        <dd>
          <bdi lang={row.locale} dir={row.locale === "ar" ? "rtl" : "auto"}>
            {row.target}
          </bdi>
        </dd>
        {row.alternative ? (
          <>
            <dt className="font-semibold">Suggested alternative</dt>
            <dd>
              <bdi lang={row.locale} dir="auto">
                {row.alternative}
              </bdi>
            </dd>
          </>
        ) : null}
        <dt className="font-semibold">Term version</dt>
        <dd className="theme-text-muted break-all text-xs">{row.version}</dd>
      </dl>
    ),
  };
}
