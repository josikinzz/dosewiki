/** Meaning-specific UI messages. IDs survive English wording changes. */
export type UiMessageDefinition = {
  source: string;
  context: string;
  locations: readonly string[];
  glossaryTerms: readonly string[];
};

export const UI_MESSAGE_DEFINITIONS = {
  "appearance.light": {
    source: "Light",
    context: "Appearance setting: a light color scheme. Not dose intensity or weight.",
    locations: ["src/app/_components/SchemeToggle.tsx", "src/app/_components/ThemeToggle.tsx"],
    glossaryTerms: [],
  },
  "appearance.dark": {
    source: "Dark",
    context: "Appearance setting: a dark color scheme.",
    locations: ["src/app/_components/SchemeToggle.tsx", "src/app/_components/ThemeToggle.tsx"],
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
} as const satisfies Record<string, UiMessageDefinition>;

export type UiMessageId = keyof typeof UI_MESSAGE_DEFINITIONS;

export function getUiMessageDefinition(id: string): UiMessageDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(UI_MESSAGE_DEFINITIONS, id)
    ? UI_MESSAGE_DEFINITIONS[id as UiMessageId]
    : undefined;
}

/** Only unambiguous legacy labels can safely share the contextual entry. */
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
  // Never fall back from a contextual ID to an ambiguous literal catalog entry.
  return catalog?.[id] ?? (id !== text ? catalog?.[text] : undefined) ?? definition?.source ?? text;
}
