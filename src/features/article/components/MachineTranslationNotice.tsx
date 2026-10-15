import type { PageReviewState } from "@server/translation/pageReview";
import { Icon } from "@/components/common/Icon";
import { formatMessage } from "@/i18n/messages";
import { translateMessage } from "@/i18n/serverMessages";
import { UI_MESSAGE_DEFINITIONS, type UiMessageId } from "@/i18n/uiMessageDefinitions";

const NOTICE_ID = "article.machineTranslationNotice";
const REVIEWED_ID = "article.humanReviewedNotice";
const COUNT_ID = "article.paragraphsReviewed";

type LinkedCopy = { before: string; linkLabel: string; after: string };

function parseLinkedCopy(template: string): LinkedCopy | null {
  const match = /^([\s\S]*?)\[([^\]]+)\]\(\{\{\s*englishUrl\s*\}\}\)([\s\S]*)$/.exec(template);
  return match ? { before: match[1], linkLabel: match[2], after: match[3] } : null;
}

function linkedCopy(locale: string, id: UiMessageId, values?: Record<string, string>): LinkedCopy {
  return parseLinkedCopy(translateMessage(locale, id, values))
    ?? parseLinkedCopy(formatMessage(UI_MESSAGE_DEFINITIONS[id].source, values))!;
}

function formatReviewDate(locale: string, at: number): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(at);
}

export type MachineTranslationNoticeProps = {
  locale: string;
  englishUrl: string;
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

export function MachineTranslationNotice({ locale, englishUrl, review }: MachineTranslationNoticeProps) {
  const reviewedAt = review && review.total > 0 && review.reviewed === review.total ? review.latestApprovedAt : null;
  const partlyReviewed = review !== undefined && review.reviewed > 0 && review.reviewed < review.total;

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
