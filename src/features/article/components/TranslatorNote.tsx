import type { ReactNode } from "react";
import type { ApprovedTranslatorNotes, TranslatorNoteSection } from "@server/translation/translatorNoteTypes";
import { Icon } from "@/components/common/Icon";
import { Surface } from "@/components/ui/surface";
import { translateMessage } from "@/i18n/serverMessages";

export type TranslatorNoteNodes = Partial<Record<TranslatorNoteSection, ReactNode>>;

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

export function translatorNoteNodes(locale: string, notes: ApprovedTranslatorNotes | undefined): TranslatorNoteNodes | undefined {
  if (!notes) return undefined;
  const nodes: TranslatorNoteNodes = {};
  for (const [section, body] of Object.entries(notes) as [TranslatorNoteSection, string][])
    nodes[section] = <TranslatorNote locale={locale} body={body} />;
  return nodes;
}
