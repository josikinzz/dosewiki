import { msg, type Translate } from "@/i18n/messages";
import type { SectionGapNeighbour, SectionGapReason, SubstanceArticle } from "@/schema";
import type { ArticleStubVerdict } from "@/schema/substance/articleStubPolicy";
import type { SubstanceSectionId } from "@/schema/substance/sectionManifest";

type NeighbourStyle = "hedge" | "pointer" | "none"

export interface ArticleGapPolicy {
  id: SubstanceSectionId;
  gapKey: string;
  label: string;
  topic: string;
  pluralTopic?: boolean;
  neighbourStyle: NeighbourStyle;
  caution?: string;
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

export interface SubsectionGapPolicy {
  gapKey: string;
  label: string;
  unwritten: string;
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

export function resolveGap(
  article: SubstanceArticle,
  policy: ArticleGapPolicy,
): ResolvedGap {
  const gaps = article.section_gaps;
  const override = gaps?.sections?.[policy.gapKey];
  return {
    reason: override?.reason ?? gaps?.reason ?? "not-written",
    family: gaps?.family ?? null,
    neighbours: override?.neighbours ?? gaps?.neighbours ?? [],
  };
}

export interface ArticleGapCopy {
  title: string;
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
