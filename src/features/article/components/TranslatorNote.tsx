import type { ReactNode } from "react";
import type { ApprovedTranslatorNotes, TranslatorNoteSection } from "@server/translation/translatorNoteTypes";
import { Icon } from "@/components/common/Icon";
import { Surface } from "@/components/ui/surface";
import { translateMessage } from "@/i18n/serverMessages";

/** Server-rendered note nodes by section, for `ArticleLayout`'s `translatorNotes` slot. */
export type TranslatorNoteNodes = Partial<Record<TranslatorNoteSection, ReactNode>>;

/**
 * One approved translator's note under an article section on a localized
 * page: a labelled box ("译者注") stating that the note is a local addition,
 * not part of the English original. Copy comes from the locale's UI catalog.
 * Reviewer names never appear.
 */
export function TranslatorNote({ locale, body }: { locale: string; body: string }) {
  const label = translateMessage(locale, "article.translatorNote.label");
  return (
    <Surface asChild variant="subtle" padding="sm" radius="xl" className="space-y-2">
      <aside aria-label={label} data-translator-note="">
        <p className="theme-text-primary flex items-center gap-2 text-sm font-semibold">
          <Icon icon="lucide:languages" size="1rem" aria-hidden="true" className="shrink-0" />
          {label}
        </p>
        <p className="theme-text-primary whitespace-pre-wrap break-words">{body}</p>
        <p className="theme-text-secondary text-xs">{translateMessage(locale, "article.translatorNote.disclaimer")}</p>
      </aside>
    </Surface>
  );
}

/** Renders each approved note for the article layout; sections without a note get nothing. */
export function translatorNoteNodes(locale: string, notes: ApprovedTranslatorNotes | undefined): TranslatorNoteNodes | undefined {
  if (!notes) return undefined;
  const nodes: TranslatorNoteNodes = {};
  for (const [section, body] of Object.entries(notes) as [TranslatorNoteSection, string][])
    nodes[section] = <TranslatorNote locale={locale} body={body} />;
  return nodes;
}
