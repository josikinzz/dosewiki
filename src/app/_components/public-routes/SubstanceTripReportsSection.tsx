import { SectionHeader } from "@/components/common/SectionHeader";
import { TripReportsSection } from "@/features/article/components/sections/TripReportsSection";
import type { SubstanceArticle } from "@/schema";
import { getPublicReportsBySubstanceNames } from "@server/convex/publicData";

function getSubstanceSearchNames(article: SubstanceArticle) {
  return Array.from(
    new Set(
      [article.title, article.identification?.common_name, ...(article.identification?.alternative_names ?? [])]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function SubstanceTripReportsSection({
  article,
  slug,
}: {
  article: SubstanceArticle;
  slug: string;
}) {
  const relatedTripReports = await getPublicReportsBySubstanceNames(getSubstanceSearchNames(article));

  return <TripReportsSection article={article} reports={relatedTripReports} fromSubstanceSlug={slug} />;
}

export function SubstanceTripReportsSectionFallback() {
  return (
    <div id="trip-reports" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:file-signature" title="Trip Reports" />
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
        Loading related reports…
      </div>
    </div>
  );
}
