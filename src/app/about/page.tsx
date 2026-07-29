import {
  getIndexLayoutByType,
  getPublicAboutPreviewSubstances,
  getPublicAboutData,
  getPublicDataOverview,
} from "@server/convex/publicData";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { applyPlaceholders } from "@/data/content/about";
import moleculeSvgMappings from "@/data/mappings/moleculeSvgMappings.json";
import { AboutMissionMarkdown } from "@/components/pages/AboutMissionMarkdown";
import { AboutPage as AboutContentPage } from "@/components/pages/AboutPage";
import { buildAboutPreviewSnapshot } from "@/components/pages/aboutArchiveSnapshot";
import type { SubstanceArticle } from "@/schema";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const revalidate = 3600;

/**
 * The Convex About document is dose.wiki's: it names dose.wiki and states its CC0 terms.
 * A flavor that owns its About prose (`about.missionMarkdown`) therefore takes neither the
 * document's markdown nor its subtitle — see `SiteAboutConfig.missionMarkdown`.
 */
const OWNS_ABOUT_PROSE = SITE_FLAVOR_CONFIG.about.missionMarkdown !== null;

function resolveAboutSubtitle(cmsSubtitle: string): string {
  return OWNS_ABOUT_PROSE ? "" : cmsSubtitle;
}

export async function generateMetadata() {
  const about = await getPublicAboutData();

  return buildPublicPageMetadata({
    title: SITE_FLAVOR_CONFIG.aboutTitle,
    description:
      resolveAboutSubtitle(about.subtitle) ||
      `Learn about the ${SITE_FLAVOR_CONFIG.name} project.`,
    route: { family: "about" },
  });
}

export default async function AboutPage() {
  const showOpenData = SITE_FLAVOR_CONFIG.about.showOpenData;

  const [about, overview, substances, chemicalLayout, mechanismLayout] = await Promise.all([
    getPublicAboutData(),
    getPublicDataOverview(),
    // The archive preview only renders inside the Open Data tab; skip the read entirely on
    // a flavor that does not show it.
    showOpenData ? getPublicAboutPreviewSubstances() : [],
    getIndexLayoutByType("chemical"),
    getIndexLayoutByType("mechanism"),
  ]);

  // Ship only the truncated JSON the preview actually renders, not 12 full articles
  // (~373 KB) serialized into the client payload. See aboutArchiveSnapshot.ts.
  const previewSnapshots = substances
    .map(({ slug: _slug, ...article }) =>
      buildAboutPreviewSnapshot(article as SubstanceArticle),
    );

  const chemicalClassCount = chemicalLayout?.categories.length ?? 0;
  const mechanismClassCount = mechanismLayout?.categories.length ?? 0;

  const placeholderValues = {
    compoundCount: overview.substanceCount.toLocaleString(),
    categoryCount: overview.psychoactiveCategoryCount.toLocaleString(),
    effectCount: overview.effectCount.toLocaleString(),
    psychoactiveClassCount: overview.psychoactiveCategoryCount.toLocaleString(),
    chemicalClassCount: chemicalClassCount.toLocaleString(),
    mechanismClassCount: mechanismClassCount.toLocaleString(),
    mechanismOfActionClassCount: mechanismClassCount.toLocaleString(),
  };

  const aboutMarkdown = applyPlaceholders(
    SITE_FLAVOR_CONFIG.about.missionMarkdown ?? about.markdown,
    placeholderValues,
  );

  return (
    <AboutContentPage
      founderProfiles={about.founderProfiles}
      previewSnapshots={previewSnapshots}
      missionContent={<AboutMissionMarkdown content={aboutMarkdown} />}
      subtitle={resolveAboutSubtitle(about.subtitle)}
      moleculeCount={moleculeSvgMappings.mappings.length}
    />
  );
}
