import type { PublicEffectPreview, PublicEffectSummary } from "../../../../lib/data/publicData.shared";

type EffectSummaryContent = Pick<PublicEffectSummary,
  "long_summary_raw" | "long_summary_ast" | "citations" | "subarticles"
>;

export function enrichEffectPreviews(
  previews: readonly PublicEffectPreview[],
  summaries: readonly PublicEffectSummary[],
): Array<PublicEffectPreview & EffectSummaryContent> {
  const summaryBySlug = new Map(summaries.map((summary) => [summary.slug, summary]));
  return previews.map((preview) => {
    const summary = summaryBySlug.get(preview.slug);
    if (!summary) return preview;
    return {
      ...preview,
      long_summary_raw: summary.long_summary_raw,
      long_summary_ast: summary.long_summary_ast,
      citations: summary.citations,
      subarticles: summary.subarticles,
    };
  });
}
