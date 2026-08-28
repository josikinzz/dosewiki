import {
  getIndexLayoutByType,
  getPublicAboutPreviewSubstances,
  getPublicAboutData,
  getPublicContributorProfiles,
  getPublicDataOverview,
  getPublicSubstanceLookup,
} from "@server/convex/publicData";
import { getPublicContributorReferenceCounts } from "@server/convex/publicData.contributorReferences";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { flavoredCopyText, getCopy } from "@server/next/copyBlocks";
import { applyPlaceholders } from "@/data/content/about";
import { ABOUT_COMMUNITY_COPY_KEYS } from "@/data/content/aboutCommunity";
import { selectAboutContributors } from "@/data/contributorRoster";
import { getMoleculeOverrideIndex } from "@server/convex/publicData.molecules";
import { AboutMissionMarkdown } from "@/components/pages/AboutMissionMarkdown";
import { AboutPage as AboutContentPage } from "@/components/pages/AboutPage";
import { buildAboutPreviewSnapshots } from "@/components/pages/aboutArchiveSnapshot";
import type { SubstanceArticle } from "@/schema";
import { SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

export const revalidate = 3600;

/**
 * The Convex About document is dose.wiki's: it names dose.wiki and states its CC0 terms.
 * A flavor that owns its About prose (`about.missionMarkdown`) therefore takes neither the
 * document's markdown nor its subtitle — see `SiteAboutConfig.missionMarkdown`.
 */
const OWNS_ABOUT_PROSE = SITE_FLAVOR_CONFIG.about.missionMarkdown !== null;

/**
 * Copy-block slot for the mission statement of a flavor that owns its About prose.
 *
 * Resolved per flavor (`about-mission-effect-index`), and only consulted on a flavor that
 * already overrides the CMS document. dose.wiki's About stays exactly where it was — on the
 * Convex `siteConfig` document that its editor edits — because a flavor with no
 * `missionMarkdown` never reaches this branch at all.
 */
const ABOUT_MISSION_COPY_KEY = "about-mission";

function resolveAboutSubtitle(cmsSubtitle: string): string {
  return OWNS_ABOUT_PROSE ? "" : cmsSubtitle;
}

export async function generateMetadata() {
  const about = await getPublicAboutData();

  return buildPublicPageMetadata({
    title: "About",
    description:
      resolveAboutSubtitle(about.subtitle) ||
      `Learn about the ${SITE_FLAVOR_CONFIG.name} project.`,
    route: { family: "about" },
    socialImage: pageSocialCardImage("about", "About dose.wiki"),
  });
}

export default async function AboutPage() {
  const copy = await getCopy();
  const showOpenData = SITE_FLAVOR_CONFIG.about.showOpenData;
  // Effect Index lists every contributor, ranked by how many pages credit them; dose.wiki keeps
  // its editor-curated founder subset. Only the ranking is gated: the profile table is already
  // read by `getPublicAboutData()` on both flavors, but the reference count pulls the effect
  // corpus, the replication gallery, the report previews and the expert-review credits, which
  // dose.wiki has no use for here.
  const showContributorRoster = isEffectIndex();

  const [
    about,
    overview,
    substances,
    chemicalLayout,
    mechanismLayout,
    contributorProfiles,
    referenceCounts,
    moleculeOverrideIndex,
    substanceLookup,
  ] = await Promise.all([
    getPublicAboutData(),
    getPublicDataOverview(),
    // The archive preview only renders inside the Open Data tab; skip the read entirely on
    // a flavor that does not show it.
    showOpenData ? getPublicAboutPreviewSubstances() : [],
    getIndexLayoutByType("chemical"),
    getIndexLayoutByType("mechanism"),
    getPublicContributorProfiles(),
    showContributorRoster
      ? getPublicContributorReferenceCounts()
      : new Map<string, number>(),
    getMoleculeOverrideIndex(),
    getPublicSubstanceLookup(),
  ]);

  // Ship only the rendered JSON the preview actually needs: the smallest articles
  // complete (within a byte budget), the rest truncated. See aboutArchiveSnapshot.ts.
  const previewSnapshots = buildAboutPreviewSnapshots(
    substances.map(({ slug: _slug, ...article }) => article as SubstanceArticle),
  );

  const chemicalClassCount = chemicalLayout?.categories.length ?? 0;
  const mechanismClassCount = mechanismLayout?.categories.length ?? 0;
  // Substance depictions live in Convex `moleculeOverrides`; `class:` rows are
  // chemical-class Markush skeletons, not downloadable substance structures.
  // Low-priority / unlisted substances ship no molecule in the public pack, so
  // they are excluded from the count shown beside the download.
  const excludedSubstanceSlugs = new Set(
    substanceLookup
      .filter((entry) => entry.priority === "low")
      .map((entry) => entry.slug),
  );
  let moleculeCount = 0;
  for (const slug of moleculeOverrideIndex.keys()) {
    if (!slug.startsWith("class:") && !excludedSubstanceSlugs.has(slug)) {
      moleculeCount += 1;
    }
  }

  const placeholderValues = {
    compoundCount: overview.substanceCount.toLocaleString(),
    categoryCount: overview.psychoactiveCategoryCount.toLocaleString(),
    effectCount: overview.effectCount.toLocaleString(),
    reportCount: overview.reportCount.toLocaleString(),
    replicationCount: overview.replicationCount.toLocaleString(),
    psychoactiveClassCount: overview.psychoactiveCategoryCount.toLocaleString(),
    chemicalClassCount: chemicalClassCount.toLocaleString(),
    mechanismClassCount: mechanismClassCount.toLocaleString(),
    mechanismOfActionClassCount: mechanismClassCount.toLocaleString(),
  };

  const missionSource = OWNS_ABOUT_PROSE
    ? flavoredCopyText(
        copy,
        ABOUT_MISSION_COPY_KEY,
        SITE_FLAVOR_CONFIG.about.missionMarkdown ?? about.markdown,
      )
    : about.markdown;

  const aboutMarkdown = applyPlaceholders(missionSource, placeholderValues);

  const contributors = selectAboutContributors({
    isEffectIndex: showContributorRoster,
    allProfiles: contributorProfiles,
    curatedFounderProfiles: about.founderProfiles,
    referenceCounts,
  });

  // Partners & Community blurbs are editable copy blocks. The roster is
  // dose.wiki's, so a flavor without it never resolves the keys and AboutPage
  // omits the section and TOC entry alike.
  const communityBlurbs = SITE_FLAVOR_CONFIG.about.showCommunity
    ? Object.fromEntries(ABOUT_COMMUNITY_COPY_KEYS.map((key) => [key, copy.text(key)]))
    : null;

  return (
    <AboutContentPage
      founderProfiles={contributors.founderProfiles}
      contributorRoster={contributors.roster}
      contributorsSectionTitle={contributors.sectionTitle}
      previewSnapshots={previewSnapshots}
      missionContent={<AboutMissionMarkdown content={aboutMarkdown} />}
      subtitle={resolveAboutSubtitle(about.subtitle)}
      moleculeCount={moleculeCount}
      communityBlurbs={communityBlurbs}
    />
  );
}
