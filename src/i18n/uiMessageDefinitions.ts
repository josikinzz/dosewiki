export type UiMessageDefinition = {
  source: string;
  context: string;
  locations: readonly string[];
  glossaryTerms: readonly string[];
};

export const UI_MESSAGE_DEFINITIONS = {
  "languageGlossary.suggest.better": {
    source: "Suggest a better translation",
    context: "Compact suggestion chip on a glossary term with existing wording. Opens a proposal form, never applies a change. Keep translations short enough for the fixed-height chip.",
    locations: ["src/features/language-glossary/LanguageGlossaryPage.tsx"],
    glossaryTerms: [],
  },
  "appearance.light": {
    source: "Light",
    context: "Appearance setting: a light color scheme. Not dose intensity or weight.",
    locations: ["src/features/appearance/SchemeToggle.tsx", "src/features/appearance/ThemeToggle.tsx"],
    glossaryTerms: [],
  },
  "appearance.dark": {
    source: "Dark",
    context: "Appearance setting: a dark color scheme.",
    locations: ["src/features/appearance/SchemeToggle.tsx", "src/features/appearance/ThemeToggle.tsx"],
    glossaryTerms: [],
  },
  "gallery.replications": {
    source: "Replications",
    context: "Gallery and navigation label for artistic recreations of subjective experiences.",
    locations: ["src/app/_components/homeQuickLinks.ts", "src/features/replications"],
    glossaryTerms: ["Replications", "Replication"],
  },
  "gallery.replication": {
    source: "Replication",
    context: "One artistic recreation of a subjective experience, not a scientific replication study.",
    locations: ["src/features/replications"],
    glossaryTerms: ["Replication", "Replications"],
  },
  "article.machineTranslationNotice": {
    source: "This page was machine translated, and the [English original]({{englishUrl}}) is authoritative. Paragraphs not yet translated remain in English.",
    context: "Standing notice above every localized substance article. Keep the Markdown link and the {{englishUrl}} placeholder exactly; translate only the link label and the prose. The link opens the English article.",
    locations: ["src/features/article/components/MachineTranslationNotice.tsx"],
    glossaryTerms: [],
  },
  "article.humanReviewedNotice": {
    source: "Reviewed by a person · {{date}} · [English original]({{englishUrl}})",
    context: "Quiet line that replaces the machine-translation notice when a person has reviewed every paragraph of a localized substance article. {{date}} is the latest approval date, already formatted for the locale. Keep the Markdown link and the {{englishUrl}} placeholder exactly; the link opens the English article. Never name the reviewer.",
    locations: ["src/features/article/components/MachineTranslationNotice.tsx"],
    glossaryTerms: [],
  },
  "article.paragraphsReviewed": {
    source: "{{reviewed}} of {{total}} paragraphs reviewed by a person.",
    context: "Added after the machine-translation notice on a partly reviewed localized article. {{reviewed}} and {{total}} are paragraph counts; {{reviewed}} is at least 1 and below {{total}}. Keep both placeholders.",
    locations: ["src/features/article/components/MachineTranslationNotice.tsx"],
    glossaryTerms: [],
  },
  "article.translatorNote.label": {
    source: "Translator's note",
    context: "Heading of a boxed note a translator wrote for local readers under one section of a localized substance article. A conventional label, like 译者注 in Chinese.",
    locations: ["src/features/article/components/TranslatorNote.tsx"],
    glossaryTerms: [],
  },
  "article.translatorNote.disclaimer": {
    source: "Added by a translator for readers of this language. It is not in the English original.",
    context: "Line inside a translator's note box on a localized substance article, stating that the note is a local addition and does not appear in the English article.",
    locations: ["src/features/article/components/TranslatorNote.tsx"],
    glossaryTerms: [],
  },
  "languageGlossary.status.filter": {
    source: "Status",
    context: "Label of the public language glossary filter that narrows terms by who checked the translation.",
    locations: ["src/features/language-glossary/LanguageGlossaryPage.tsx"],
    glossaryTerms: [],
  },
  "languageGlossary.status.all": {
    source: "All statuses",
    context: "Public language glossary status filter option that shows every term.",
    locations: ["src/features/language-glossary/LanguageGlossaryPage.tsx"],
    glossaryTerms: [],
  },
  "languageGlossary.status.human_review": {
    source: "Checked by a person",
    context: "Status of a glossary term whose live translation a human reviewer confirmed. Never names the reviewer.",
    locations: ["src/features/language-glossary/LanguageGlossaryPage.tsx"],
    glossaryTerms: [],
  },
  "languageGlossary.status.machine_suggestion": {
    source: "Machine suggestion",
    context: "Status of a glossary term whose shown translation is a proposal nobody has approved yet.",
    locations: ["src/features/language-glossary/LanguageGlossaryPage.tsx"],
    glossaryTerms: [],
  },
  "languageGlossary.status.legacy_unverified": {
    source: "Live, not yet checked",
    context: "Status of a glossary term whose translation already appears on the site but no person has checked yet.",
    locations: ["src/features/language-glossary/LanguageGlossaryPage.tsx"],
    glossaryTerms: [],
  },
  "languageGlossary.status.missing": {
    source: "Not translated yet",
    context: "Status of a glossary term that has no translation in this language yet.",
    locations: ["src/features/language-glossary/LanguageGlossaryPage.tsx"],
    glossaryTerms: [],
  },
  "languageGlossary.example.source": {
    source: "See this sentence on the site",
    context: "Link under a glossary term's example sentence pair; opens the page the English sentence comes from.",
    locations: ["src/features/language-glossary/LanguageGlossaryPage.tsx"],
    glossaryTerms: [],
  },
  "translationCredits.title": {
    source: "Translation contributors",
    context: "Heading above the people credited for translating and reviewing this language edition of the site. Each entry below is a person's name and one line on what they contributed.",
    locations: [
      "src/features/language-glossary/TranslationCredits.tsx",
      "src/features/language-glossary/LanguageGlossaryPage.tsx",
      "src/app/zh/about/page.tsx",
      "src/app/ru/about/page.tsx",
      "src/app/zh/glossary/page.tsx",
      "src/app/ru/glossary/page.tsx",
    ],
    glossaryTerms: [],
  },
} as const satisfies Record<string, UiMessageDefinition>;

export type UiMessageId = keyof typeof UI_MESSAGE_DEFINITIONS;

export function getUiMessageDefinition(id: string): UiMessageDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(UI_MESSAGE_DEFINITIONS, id)
    ? UI_MESSAGE_DEFINITIONS[id as UiMessageId]
    : undefined;
}

export const UI_MESSAGE_ALIASES: Readonly<Record<string, UiMessageId>> = {
  Replications: "gallery.replications",
  Replication: "gallery.replication",
};

export function uiMessageId(text: string): string {
  return UI_MESSAGE_ALIASES[text] ?? text;
}

export function resolveUiMessage(
  catalog: Readonly<Record<string, string>> | undefined,
  text: string,
): string {
  const id = uiMessageId(text);
  const definition = getUiMessageDefinition(id);
  return catalog?.[id] ?? (id !== text ? catalog?.[text] : undefined) ?? definition?.source ?? text;
}
