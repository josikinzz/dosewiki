import names from "@/i18n/translationLocaleNames.json";

const nativeNames: Record<keyof typeof names, string> = {
  "zh-Hans": "简体中文",
  nl: "Nederlands",
  ar: "العربية",
  cs: "Čeština",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  hi: "हिन्दी",
  ja: "日本語",
  ko: "한국어",
  pl: "Polski",
  pt: "Português",
  ru: "Русский",
};
export const glossaryLanguages = Object.entries(names).map(([code, name]) => ({
  code,
  name,
  nativeName: nativeNames[code as keyof typeof names],
  direction: code === "ar" ? ("rtl" as const) : ("ltr" as const),
}));
export function glossaryLanguage(code: string) {
  return glossaryLanguages.find((language) => language.code === code);
}
export type PublicGlossaryEntry = {
  term: string;
  kind: string;
  gloss: string | null;
  target: string | null;
  status: "draft" | "approved" | "missing";
  version: string | null;
};
export type Rendering = {
  term: string;
  kind: string;
  target: string;
  status: "draft" | "approved";
  updated_at: number;
  /** Draft/restore changes advance this even when approved bytes are unchanged. */
  review_revision?: number;
};
/** Include the exact rendering and status so even same-millisecond edits cannot share a version. */
export function renderingVersion(row: Rendering): string {
  return JSON.stringify([
    row.updated_at,
    row.target,
    row.kind,
    row.status,
    row.review_revision ?? 0,
  ]);
}
export function projectGlossary(
  glosses: readonly { term: string; kind: string; gloss: string }[],
  rows: readonly Rendering[],
): PublicGlossaryEntry[] {
  const entries = new Map<string, PublicGlossaryEntry>();
  for (const row of glosses)
    entries.set(row.term, {
      term: row.term,
      kind: row.kind,
      gloss: row.gloss || null,
      target: null,
      status: "missing",
      version: null,
    });
  for (const row of rows)
    entries.set(row.term, {
      term: row.term,
      kind: row.kind,
      gloss: entries.get(row.term)?.gloss ?? null,
      target: row.target || null,
      status: row.status,
      version: renderingVersion(row),
    });
  return [...entries.values()].sort((a, b) => a.term.localeCompare(b.term));
}
export type LanguageDestination = {
  code: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  href: string;
  readiness: string;
};
