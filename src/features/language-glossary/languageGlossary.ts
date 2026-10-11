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
/** "German, Simplified Chinese" for visible text; a code with no known name reads as itself. */
export function languageNames(codes: readonly string[] | undefined): string {
  return (codes ?? []).map((code) => glossaryLanguage(code)?.name ?? code).join(", ");
}
/** Who stands behind the shown wording. Never names the reviewer. */
export type PublicGlossaryProvenance =
  | "human_review"
  | "machine_suggestion"
  | "legacy_unverified"
  | "missing";
export const PUBLIC_GLOSSARY_PROVENANCES: readonly PublicGlossaryProvenance[] =
  ["human_review", "machine_suggestion", "legacy_unverified", "missing"];
/** One real sentence from the site, both sides trimmed around the term. */
export type GlossaryExample = { english: string; target: string; href: string };
export type PublicGlossaryEntry = {
  term: string;
  kind: string;
  gloss: string | null;
  target: string | null;
  status: "draft" | "approved" | "missing";
  provenance: PublicGlossaryProvenance;
  example: GlossaryExample | null;
  version: string | null;
};
export type Rendering = {
  term: string;
  kind: string;
  target: string;
  status: "draft" | "approved";
  /** Absent reads as unchecked: approved wording is never assumed checked. */
  provenance?: Exclude<PublicGlossaryProvenance, "missing">;
  updated_at: number;
  /** Draft/restore changes advance this even when approved bytes are unchanged. */
  review_revision?: number;
};
/**
 * The version a reader sees for a term with no rendering in their language.
 * A suggestion sent against it fails as stale once any rendering appears,
 * exactly as a suggestion against an edited rendering does.
 */
export const MISSING_RENDERING_VERSION = JSON.stringify(["missing"]);
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
      provenance: "missing",
      example: null,
      version: MISSING_RENDERING_VERSION,
    });
  for (const row of rows)
    entries.set(row.term, {
      term: row.term,
      kind: row.kind,
      gloss: entries.get(row.term)?.gloss ?? null,
      target: row.target || null,
      status: row.status,
      provenance:
        row.status === "draft"
          ? "machine_suggestion"
          : (row.provenance ?? "legacy_unverified"),
      example: null,
      version: renderingVersion(row),
    });
  return [...entries.values()].sort((a, b) => a.term.localeCompare(b.term));
}
/**
 * Which terms most need a person, first: nothing yet, then a machine draft,
 * then live wording nobody checked, then checked wording.
 */
const REVIEW_PRIORITY: Record<PublicGlossaryProvenance, number> = {
  missing: 0,
  machine_suggestion: 1,
  legacy_unverified: 2,
  human_review: 3,
};
export function needsHumanReview(entry: Pick<PublicGlossaryEntry, "provenance">): boolean {
  return entry.provenance !== "human_review";
}
/** Review priority first, then English term, so equal-priority rows keep a stable order. */
export function sortByReviewPriority<T extends Pick<PublicGlossaryEntry, "provenance" | "term">>(
  entries: readonly T[],
): T[] {
  return [...entries].sort(
    (a, b) =>
      REVIEW_PRIORITY[a.provenance] - REVIEW_PRIORITY[b.provenance] ||
      a.term.localeCompare(b.term, "en"),
  );
}
export type LanguageDestination = {
  code: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  href: string;
  readiness: string;
};
