import { Icon } from "@/components/common/Icon";
import { translateMessage } from "@/i18n/serverMessages";
import { UI_MESSAGE_DEFINITIONS } from "@/i18n/uiMessageDefinitions";

const NOTICE_ID = "article.machineTranslationNotice";

type NoticeCopy = { before: string; linkLabel: string; after: string };

/** Split catalog copy around its one `[label]({{englishUrl}})` link. */
function parseNoticeCopy(template: string): NoticeCopy | null {
  const match = /^([\s\S]*?)\[([^\]]+)\]\(\{\{\s*englishUrl\s*\}\}\)([\s\S]*)$/.exec(template);
  return match ? { before: match[1], linkLabel: match[2], after: match[3] } : null;
}

/** Copy from the locale's UI catalog; English when the locale has none or its
 * entry lost the link, so a reader is never left without the English page. */
function noticeCopy(locale: string): NoticeCopy {
  return parseNoticeCopy(translateMessage(locale, NOTICE_ID))
    ?? parseNoticeCopy(UI_MESSAGE_DEFINITIONS[NOTICE_ID].source)!;
}

export type MachineTranslationNoticeProps = {
  /** UI locale of the mirror, e.g. `zh-Hans` or `ru`. */
  locale: string;
  /** Absolute URL of the English article on the main host. */
  englishUrl: string;
};

/**
 * The standing notice on every localized article: the text is machine
 * translated, the English is canonical, and the English page is one click away
 * on the main host. Bare like the beta disclaimer so it reads as site status,
 * not as another safety banner.
 */
export function MachineTranslationNotice({ locale, englishUrl }: MachineTranslationNoticeProps) {
  const copy = noticeCopy(locale);
  return (
    <p className="theme-text-secondary mx-auto flex w-fit items-center gap-2 text-center text-sm text-balance">
      <Icon icon="lucide:languages" size="1rem" aria-hidden="true" className="shrink-0" />
      <span>
        {copy.before}
        <a href={englishUrl} lang="en" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
          {copy.linkLabel}
        </a>
        {copy.after}
      </span>
    </p>
  );
}
