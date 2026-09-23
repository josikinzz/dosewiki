import type { PageReviewState } from "@server/translation/pageReview";
import { Icon } from "@/components/common/Icon";
import { formatMessage } from "@/i18n/messages";
import { translateMessage } from "@/i18n/serverMessages";
import { UI_MESSAGE_DEFINITIONS, type UiMessageId } from "@/i18n/uiMessageDefinitions";

const NOTICE_ID = "article.machineTranslationNotice";
const REVIEWED_ID = "article.humanReviewedNotice";
const COUNT_ID = "article.paragraphsReviewed";

type LinkedCopy = { before: string; linkLabel: string; after: string };

/** Split catalog copy around its one `[label]({{englishUrl}})` link. */
function parseLinkedCopy(template: string): LinkedCopy | null {
  const match = /^([\s\S]*?)\[([^\]]+)\]\(\{\{\s*englishUrl\s*\}\}\)([\s\S]*)$/.exec(template);
  return match ? { before: match[1], linkLabel: match[2], after: match[3] } : null;
}

/** Copy from the locale's UI catalog; English when the locale has none or its
 * entry lost the link, so a reader is never left without the English page.
 * `values` fill every placeholder except `englishUrl`, which becomes the link. */
function linkedCopy(locale: string, id: UiMessageId, values?: Record<string, string>): LinkedCopy {
  return parseLinkedCopy(translateMessage(locale, id, values))
    ?? parseLinkedCopy(formatMessage(UI_MESSAGE_DEFINITIONS[id].source, values))!;
}

/** The approval day in the locale's own date style, fixed to UTC so every render of a page agrees. */
function formatReviewDate(locale: string, at: number): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(at);
}

export type MachineTranslationNoticeProps = {
  /** UI locale of the mirror, e.g. `zh-Hans` or `ru`. */
  locale: string;
  /** Absolute URL of the English article on the main host. */
  englishUrl: string;
  /** Review tally and latest approval date, computed with the page. Absent or
   * zero reviewed renders the plain notice. */
  review?: PageReviewState;
};

function LinkedLine({ copy, englishUrl }: { copy: LinkedCopy; englishUrl: string }) {
  return (
    <span>
      {copy.before}
      <a href={englishUrl} lang="en" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
        {copy.linkLabel}
      </a>
      {copy.after}
    </span>
  );
}

/**
 * The standing notice on every localized article: the text is machine
 * translated, the English is canonical, and the English page is one click away
 * on the main host. Bare like the beta disclaimer so it reads as site status,
 * not as another safety banner.
 *
 * Once a person has approved every paragraph against the current English, the
 * notice becomes a quiet reviewed line with the latest approval date, still
 * linking to the English. A partly reviewed page keeps the notice and adds the
 * count. Reviewer names never appear here.
 */
export function MachineTranslationNotice({ locale, englishUrl, review }: MachineTranslationNoticeProps) {
  const reviewedAt = review && review.total > 0 && review.reviewed === review.total ? review.latestApprovedAt : null;
  const partlyReviewed = review !== undefined && review.reviewed > 0 && review.reviewed < review.total;

  // The reviewed line promises a date, so a fully approved page without one keeps the notice.
  if (reviewedAt !== null) {
    const copy = linkedCopy(locale, REVIEWED_ID, { date: formatReviewDate(locale, reviewedAt) });
    return (
      <p className="theme-text-secondary mx-auto flex w-fit items-center gap-2 text-center text-sm text-balance">
        <Icon icon="lucide:user-check" size="1rem" aria-hidden="true" className="shrink-0" />
        <LinkedLine copy={copy} englishUrl={englishUrl} />
      </p>
    );
  }

  return (
    <p className="theme-text-secondary mx-auto flex w-fit items-center gap-2 text-center text-sm text-balance">
      <Icon icon="lucide:languages" size="1rem" aria-hidden="true" className="shrink-0" />
      <LinkedLine copy={linkedCopy(locale, NOTICE_ID)} englishUrl={englishUrl} />
      {partlyReviewed && (
        <span>{translateMessage(locale, COUNT_ID, { reviewed: review.reviewed, total: review.total })}</span>
      )}
    </p>
  );
}
