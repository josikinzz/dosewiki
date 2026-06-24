import { getPublicAboutData, getPublicDataOverview, getRawSubstances } from "@server/convex/publicData";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { applyPlaceholders } from "@/data/content/about";
import { AboutMissionMarkdown } from "@/components/pages/AboutMissionMarkdown";
import { AboutPage as AboutContentPage } from "@/components/pages/AboutPage";
import { buildAboutPreviewSnapshot } from "@/components/pages/aboutArchiveSnapshot";
import { isLowPrioritySubstance, type SubstanceArticle } from "@/schema";

export const revalidate = 3600;

export async function generateMetadata() {
  const about = await getPublicAboutData();

  return buildPublicPageMetadata({
    title: "About dose.wiki",
    description:
      about.subtitle ||
      "Learn about the dose.wiki project.",
    route: { family: "about" },
  });
}

export default async function AboutPage() {
  const [about, overview, substances] = await Promise.all([
    getPublicAboutData(),
    getPublicDataOverview(),
    getRawSubstances(),
  ]);

  // Ship only the truncated JSON the preview actually renders, not 12 full articles
  // (~373 KB) serialized into the client payload. See aboutArchiveSnapshot.ts.
  const previewSnapshots = substances
    .filter((substance) => !isLowPrioritySubstance(substance.priority))
    .slice(0, 12)
    .map(({ slug: _slug, ...article }) =>
      buildAboutPreviewSnapshot(article as SubstanceArticle),
    );

  const placeholderValues = {
    compoundCount: overview.substanceCount.toLocaleString(),
    categoryCount: overview.psychoactiveCategoryCount.toLocaleString(),
    effectCount: overview.effectCount.toLocaleString(),
    psychoactiveClassCount: overview.psychoactiveCategoryCount.toLocaleString(),
    chemicalClassCount: "0",
    mechanismClassCount: "0",
    mechanismOfActionClassCount: "0",
  };

  const aboutMarkdown = applyPlaceholders(about.markdown, placeholderValues);

  return (
    <AboutContentPage
      founderProfiles={about.founderProfiles}
      previewSnapshots={previewSnapshots}
      missionContent={<AboutMissionMarkdown content={aboutMarkdown} />}
    />
  );
}
