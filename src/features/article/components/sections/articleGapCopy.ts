import type { IconName } from "@/components/common/Icon";
import type { SectionGapNeighbour, SectionGapReason, SubstanceArticle } from "@/schema";

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
export type NeighbourStyle = "hedge" | "pointer" | "none";

export interface ArticleGapPolicy {
  /** Section id, matching the public renderer and the TOC anchor. */
  id: string;
  /** Key under `section_gaps.sections`, matching the quote-section ids. */
  gapKey: string;
  label: string;
  icon: IconName;
  /** Lowercase noun used mid-sentence. */
  topic: string;
  /** Whether `topic` takes a plural verb — "subjective effects are", "tolerance is". */
  pluralTopic?: boolean;
  neighbourStyle: NeighbourStyle;
  /** Shown wherever an analogy could be misread as advice. */
  caution?: string;
}

export const ARTICLE_GAP_POLICIES = {
  dosage_duration: {
    id: "dosage-duration",
    gapKey: "dosage_duration",
    label: "Dosage & Duration",
    icon: "lucide:chart-no-axes-combined",
    topic: "dosage or duration",
    neighbourStyle: "pointer",
    caution: "Dose ranges do not transfer between analogues. Do not infer one from these.",
  },
  subjective_effects: {
    id: "subjective-effects",
    gapKey: "subjective_effects",
    label: "Subjective Effects",
    icon: "lucide:sparkles",
    topic: "subjective effects",
    pluralTopic: true,
    neighbourStyle: "hedge",
  },
  pharmacology: {
    id: "pharmacology",
    gapKey: "pharmacology",
    label: "Pharmacology",
    icon: "mingcute:settings-6-line",
    topic: "pharmacology",
    neighbourStyle: "hedge",
  },
  tolerance: {
    id: "tolerance",
    gapKey: "tolerance",
    label: "Tolerance",
    icon: "lucide:trending-up",
    topic: "tolerance",
    neighbourStyle: "hedge",
  },
  harm_potential: {
    id: "harm-potential",
    gapKey: "harm_potential",
    label: "Harm Potential",
    icon: "lucide:ambulance",
    topic: "harm potential",
    neighbourStyle: "pointer",
    caution: "An absence of harm data is not evidence of safety.",
  },
  history_culture: {
    id: "history-culture",
    gapKey: "history_culture",
    label: "History & Culture",
    icon: "lucide:book-open",
    topic: "history",
    neighbourStyle: "none",
  },
  legality: {
    id: "legality",
    gapKey: "legality",
    label: "Legality",
    icon: "lucide:scale",
    topic: "legal status",
    neighbourStyle: "pointer",
    caution: "Legal status is jurisdictional and is not predicted by chemical class.",
  },
} as const satisfies Record<string, ArticleGapPolicy>;

export type ArticleGapPolicyKey = keyof typeof ARTICLE_GAP_POLICIES;

/** Article order, for the stub-banner count and the missing-section list. */
export const ARTICLE_GAP_ORDER: ArticleGapPolicyKey[] = [
  "dosage_duration",
  "subjective_effects",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
];

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
}

export function buildArticleGapCopy(
  policy: ArticleGapPolicy,
  gap: ResolvedGap,
): ArticleGapCopy {
  const title =
    gap.reason === "sources-silent"
      ? `No published ${policy.topic} data`
      : `${policy.label} not written up yet`;

  // The hedge stays soft on purpose. "Broadly consistent across the class" would
  // assert something nobody has measured for this compound; "likely somewhat
  // similar" is as far as class membership licenses.
  let lead = "";
  if (gap.neighbours.length > 0 && policy.neighbourStyle !== "none") {
    if (policy.neighbourStyle === "hedge") {
      const verb = policy.pluralTopic ? "are" : "is";
      const topic = policy.topic.charAt(0).toUpperCase() + policy.topic.slice(1);
      lead = gap.family
        ? `${topic} ${verb} likely somewhat similar to other ${gap.family}:`
        : `${topic} ${verb} likely somewhat similar to:`;
    } else {
      lead = "Better documented nearby:";
    }
  }

  return {
    title,
    lead,
    caution: gap.neighbours.length > 0 ? policy.caution : undefined,
  };
}

export function buildArticleStubCopy(missing: number, total: number): string {
  return `${spellOut(missing)} of its ${spellOut(total)} sections have no published data. Everything shown is sourced; the gaps are real gaps, not omissions.`;
}

function spellOut(value: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven"][value] ?? String(value);
}
