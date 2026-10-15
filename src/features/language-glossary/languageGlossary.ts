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
export function languageNames(codes: readonly string[] | undefined): string {
  return (codes ?? []).map((code) => glossaryLanguage(code)?.name ?? code).join(", ");
}
export type PublicGlossaryProvenance =
  | "human_review"
  | "machine_suggestion"
  | "legacy_unverified"
  | "missing";
export const PUBLIC_GLOSSARY_PROVENANCES: readonly PublicGlossaryProvenance[] =
  ["human_review", "machine_suggestion", "legacy_unverified", "missing"];
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
  provenance?: Exclude<PublicGlossaryProvenance, "missing">;
  updated_at: number;
  review_revision?: number;
};
export const MISSING_RENDERING_VERSION = JSON.stringify(["missing"]);
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
const REVIEW_PRIORITY: Record<PublicGlossaryProvenance, number> = {
  missing: 0,
  machine_suggestion: 1,
  legacy_unverified: 2,
  human_review: 3,
};
const REVIEW_TIERS: readonly (readonly string[])[] = [
  ["register", "enum:dose-tier", "enum:duration-stage", "enum:interaction-tier", "enum:risk-level", "enum:legal-status", "enum:evidence-level", "enum:carcinogenicity-level", "route", "frequency", "psychoactive-class"],
  ["effect-category", "effect-subcategory", "effect-name"],
  ["site-name", "index-name", "section-heading", "replication"],
  ["chemical-class", "chemical-class-alias", "reagent-name"],
];
const UNLISTED_KIND_TIER = 2;
const KIND_RANK = new Map(
  REVIEW_TIERS.flatMap((kinds, tier) => kinds.map((kind, position) => [kind, { tier, position }] as const)),
);
function kindRank(kind: string) {
  return KIND_RANK.get(kind) ?? { tier: UNLISTED_KIND_TIER, position: Number.MAX_SAFE_INTEGER };
}
export function needsHumanReview(entry: Pick<PublicGlossaryEntry, "provenance">): boolean {
  return entry.provenance !== "human_review";
}
export function sortByReviewPriority<T extends Pick<PublicGlossaryEntry, "provenance" | "term" | "kind">>(
  entries: readonly T[],
): T[] {
  return [...entries].sort((a, b) => {
    const rankA = kindRank(a.kind);
    const rankB = kindRank(b.kind);
    return (
      rankA.tier - rankB.tier ||
      REVIEW_PRIORITY[a.provenance] - REVIEW_PRIORITY[b.provenance] ||
      rankA.position - rankB.position ||
      a.term.localeCompare(b.term, "en")
    );
  });
}
export type LanguageDestination = {
  code: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  href: string;
  readiness: string;
};
