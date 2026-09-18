import { msg, type Translate } from "@/i18n/messages";
import type { SectionGapNeighbour, SectionGapReason, SubstanceArticle } from "@/schema";
import type { ArticleStubVerdict } from "@/schema/substance/articleStubPolicy";
import type { SubstanceSectionId } from "@/schema/substance/sectionManifest";

/**
 * Wording and policy for sections that have no published content.
 *
 * The per-article data (neighbours, family, reason) lives on the article record
 * under `section_gaps`. What lives here is the part that must not vary between
 * articles: the sentences, and which sections are allowed to phrase their
 * neighbour list as an inference about this substance.
 */

/**
 * Whether the neighbour list may be read as a claim about this compound.
 *
 * `hedge`   — class membership genuinely predicts the answer, so the copy may say so.
 * `pointer` — it does not, so the neighbours are navigation only, plus a caution.
 * `none`    — nothing worth pointing at; the absence is the whole statement.
 */
type NeighbourStyle = "hedge" | "pointer" | "none"

export interface ArticleGapPolicy {
  /**
   * Section id, matching the public renderer and the TOC anchor. The notice
   * heading takes its glyph from the catalog entry under this id, so an empty
   * section and a filled one show the same icon.
   */
  id: SubstanceSectionId;
  /** Key under `section_gaps.sections`, matching the quote-section ids. */
  gapKey: string;
  label: string;
  /** Lowercase noun used mid-sentence. */
  topic: string;
  /** Whether `topic` takes a plural verb — "subjective effects are", "tolerance is". */
  pluralTopic?: boolean;
  neighbourStyle: NeighbourStyle;
  /** Shown wherever an analogy could be misread as advice. */
  caution?: string;
  /**
   * Where to look instead. Unlike `caution`, which qualifies a neighbour list,
   * this stands on its own — it is shown whenever the section is empty, because
   * for some sections the absence is precisely what the reader has to act on.
   */
  lookElsewhere?: string;
}

export const ARTICLE_GAP_POLICIES = {
  dosage_duration: {
    id: "dosage-duration",
    gapKey: "dosage_duration",
    label: msg("Dosage & Duration"),
    topic: msg("dosage or duration"),
    neighbourStyle: "pointer",
    caution: msg("Dose ranges do not transfer between analogues. Do not infer one from these."),
  },
  subjective_effects: {
    id: "subjective-effects",
    gapKey: "subjective_effects",
    label: msg("Subjective Effects"),
    topic: msg("subjective effects"),
    pluralTopic: true,
    neighbourStyle: "hedge",
  },
  pharmacology: {
    id: "pharmacology",
    gapKey: "pharmacology",
    label: msg("Pharmacology"),
    topic: msg("pharmacology"),
    neighbourStyle: "hedge",
  },
  interactions: {
    id: "interactions",
    gapKey: "interactions",
    label: msg("Interactions"),
    topic: msg("interaction"),
    // Combination risk is a property of the pair, not of the chemical class, so
    // a neighbour's combo chart says nothing about this one. The absence is the
    // whole statement, and the reader is sent to a dedicated checker instead.
    neighbourStyle: "none",
    lookElsewhere: msg(
      "An unlisted combination is an unknown one, not a safe one. Check a dedicated combination chart before mixing.",
    ),
  },
  tolerance: {
    id: "tolerance",
    gapKey: "tolerance",
    label: msg("Tolerance"),
    topic: msg("tolerance"),
    neighbourStyle: "hedge",
  },
  harm_potential: {
    id: "harm-potential",
    gapKey: "harm_potential",
    label: msg("Harm Potential"),
    topic: msg("harm potential"),
    neighbourStyle: "pointer",
    caution: msg("An absence of harm data is not evidence of safety."),
  },
  history_culture: {
    id: "history-culture",
    gapKey: "history_culture",
    label: msg("History & Culture"),
    topic: msg("history"),
    neighbourStyle: "none",
  },
  legality: {
    id: "legality",
    gapKey: "legality",
    label: msg("Legality"),
    topic: msg("legal status"),
    neighbourStyle: "pointer",
    caution: msg("Legal status is jurisdictional and is not predicted by chemical class."),
  },
} as const satisfies Record<string, ArticleGapPolicy>;

export type ArticleGapPolicyKey = keyof typeof ARTICLE_GAP_POLICIES;

/** Article order, for the stub-banner count and the missing-section list. */
export const ARTICLE_GAP_ORDER: ArticleGapPolicyKey[] = [
  "dosage_duration",
  "subjective_effects",
  "pharmacology",
  "interactions",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
];

/**
 * Wording for a single empty slot inside a section that does render.
 *
 * The three absence notices are deliberately not the same thing, and the words
 * have to keep them apart. An *article* can be a stub — started, incomplete,
 * and the reader should discount the whole page accordingly. A *section* is
 * "not written up yet" — a body of work nobody has done. A *slot* like
 * metabolites or half-life is neither: it is one fact, either recorded or not,
 * so it says "not documented" and claims nothing about the rest of the article.
 * "Stub" never appears at this level.
 *
 * `label` names the slot rather than repeating the subsection heading above it,
 * so the row adds information instead of echoing what the reader just read.
 */
export interface SubsectionGapPolicy {
  /** Key under `section_gaps.sections`, namespaced by its parent section. */
  gapKey: string;
  label: string;
  /** Shown when the slot is empty because nobody has written it up. */
  unwritten: string;
  /** Shown when extraction ran and the sources genuinely had nothing. */
  silent: string;
}

export const SUBSECTION_GAP_POLICIES = {
  pharmacokinetics: {
    gapKey: "pharmacology.pharmacokinetics",
    label: msg("Absorption & half-life"),
    unwritten: msg("not documented yet"),
    silent: msg("no published data"),
  },
  metabolites: {
    gapKey: "pharmacology.metabolites",
    label: msg("Metabolites"),
    unwritten: msg("none documented yet"),
    silent: msg("none reported in the literature"),
  },
} as const satisfies Record<string, SubsectionGapPolicy>;

export type SubsectionGapPolicyKey = keyof typeof SUBSECTION_GAP_POLICIES;

/**
 * The reason for one empty slot.
 *
 * Falls back through the parent section's override to the article default, so
 * an article whose pharmacology gaps are already recorded as `sources-silent`
 * does not have to repeat that per slot. The final default is `not-written`,
 * for the same reason it is at section level: "every source is silent" is an
 * evidence claim and must be recorded deliberately, never assumed.
 */
export function resolveSubsectionGapReason(
  article: SubstanceArticle,
  policy: SubsectionGapPolicy,
  parentGapKey: string,
): SectionGapReason {
  const gaps = article.section_gaps;
  return (
    gaps?.sections?.[policy.gapKey]?.reason ??
    gaps?.sections?.[parentGapKey]?.reason ??
    gaps?.reason ??
    "not-written"
  );
}

export function buildSubsectionGapCopy(
  t: Translate,
  policy: SubsectionGapPolicy,
  reason: SectionGapReason,
): { label: string; status: string } {
  return {
    label: t(policy.label),
    status: t(reason === "sources-silent" ? policy.silent : policy.unwritten),
  };
}

export interface ResolvedGap {
  reason: SectionGapReason;
  family: string | null;
  neighbours: SectionGapNeighbour[];
}

/** Merge the article-level defaults with any per-section override. */
export function resolveGap(
  article: SubstanceArticle,
  policy: ArticleGapPolicy,
): ResolvedGap {
  const gaps = article.section_gaps;
  const override = gaps?.sections?.[policy.gapKey];
  return {
    // Absent metadata is the common case while the backfill is in progress, and
    // "not written up yet" is the honest default: claiming every source is silent
    // is an evidence claim, and it must be recorded deliberately, never assumed.
    reason: override?.reason ?? gaps?.reason ?? "not-written",
    family: gaps?.family ?? null,
    neighbours: override?.neighbours ?? gaps?.neighbours ?? [],
  };
}

export interface ArticleGapCopy {
  title: string;
  /** Sentence introducing the neighbour list. Empty when there is nothing to introduce. */
  lead: string;
  caution?: string;
  lookElsewhere?: string;
}

export function buildArticleGapCopy(
  t: Translate,
  policy: ArticleGapPolicy,
  gap: ResolvedGap,
): ArticleGapCopy {
  const title =
    gap.reason === "sources-silent"
      ? t("No published {{topic}} data", { topic: t(policy.topic) })
      : t("{{label}} not written up yet", { label: t(policy.label) });

  // The hedge stays soft on purpose. "Broadly consistent across the class" would
  // assert something nobody has measured for this compound; "likely somewhat
  // similar" is as far as class membership licenses.
  let lead = "";
  if (gap.neighbours.length > 0 && policy.neighbourStyle !== "none") {
    if (policy.neighbourStyle === "hedge") {
      const topicWord = t(policy.topic);
      const topic = topicWord.charAt(0).toUpperCase() + topicWord.slice(1);
      if (gap.family) {
        lead = policy.pluralTopic
          ? t("{{topic}} are likely somewhat similar to other {{family}}:", { topic, family: gap.family })
          : t("{{topic}} is likely somewhat similar to other {{family}}:", { topic, family: gap.family });
      } else {
        lead = policy.pluralTopic
          ? t("{{topic}} are likely somewhat similar to:", { topic })
          : t("{{topic}} is likely somewhat similar to:", { topic });
      }
    } else {
      lead = t("Better documented nearby:");
    }
  }

  return {
    title,
    lead,
    caution: gap.neighbours.length > 0 && policy.caution ? t(policy.caution) : undefined,
    lookElsewhere: policy.lookElsewhere ? t(policy.lookElsewhere) : undefined,
  };
}

/**
 * Tooltip for the stub banner.
 *
 * An article qualifies as a stub for either of two independent reasons, and the
 * sentence has to name the one that actually fired: an article with two empty
 * sections and no dose ranges is a stub, but telling the reader "two of its
 * seven sections have no published data" would explain the banner by a count
 * that does not on its own trigger it.
 */
export function buildArticleStubCopy(t: Translate, verdict: ArticleStubVerdict, total: number): string {
  const sentences: string[] = [];

  if (verdict.reasons.includes("no-dosage")) {
    sentences.push(t("No dosage or duration data has been published for it."));
  }
  if (verdict.reasons.includes("missing-sections")) {
    const count = spellOut(t, verdict.emptySectionIds.length);
    sentences.push(
      t("{{count}} of its {{total}} sections have no published data.", {
        count: count.charAt(0).toUpperCase() + count.slice(1),
        total: spellOut(t, total),
      }),
    );
  }

  sentences.push(t("Everything shown is sourced; the gaps are real gaps, not omissions."));
  return sentences.join(" ");
}

const NUMBER_WORDS = [
  msg("zero"),
  msg("one"),
  msg("two"),
  msg("three"),
  msg("four"),
  msg("five"),
  msg("six"),
  msg("seven"),
  msg("eight"),
];

function spellOut(t: Translate, value: number): string {
  const word = NUMBER_WORDS[value];
  return word === undefined ? String(value) : t(word);
}
