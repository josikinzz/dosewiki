import {
  getIndexLayoutByType,
  getPublicAboutPreviewSubstances,
  getPublicAboutData,
  getPublicContributorProfiles,
  getPublicDataOverview,
} from "@server/data/publicData";
import { getMoleculePackDownloadStats } from "@server/open-data/downloadStats";
import { getPublicContributorReferenceCounts } from "@server/data/publicData.contributorReferences";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { flavoredCopyKey, flavoredCopyText, getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import { applyPlaceholders } from "@/data/content/about";
import { t } from "@/i18n/server";
import { msg } from "@/i18n/messages";
import { splitAboutMarkdown } from "@/data/content/aboutSections";
import { selectAboutContributors } from "@/data/contributorRoster";
import { AboutMissionMarkdown } from "@/components/pages/AboutMissionMarkdown";
import { AboutPage as AboutContentPage } from "@/components/pages/AboutPage";
import { buildAboutPreviewSnapshots } from "@/components/pages/aboutArchiveSnapshot";
import type { SubstanceArticle } from "@/schema";
import { SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";
import { EditorLauncherTarget } from "@/features/editor-launcher/EditorLauncherTarget";
import AboutBlock from "@/features/dev/tools/about/AboutBlock.editor";
import CopyBlock from "@/features/dev/tools/copy-studio/CopyBlock.editor";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";

export const revalidate = 3600;

/**
 * The Postgres About document is dose.wiki's: it names dose.wiki and states its CC0 terms.
 * A flavor that owns its About prose (`about.missionMarkdown`) therefore takes neither the
 * document's markdown nor its subtitle — see `SiteAboutConfig.missionMarkdown`.
 */
const OWNS_ABOUT_PROSE = SITE_FLAVOR_CONFIG.about.missionMarkdown !== null;

/**
 * Copy-block slot for the mission statement of a flavor that owns its About prose.
 *
 * Resolved per flavor (`about-mission-effect-index`), and only consulted on a flavor that
 * already overrides the CMS document. dose.wiki's About stays exactly where it was — on the
 * Postgres `siteConfig` document that its editor edits — because a flavor with no
 * `missionMarkdown` never reaches this branch at all.
 */
const ABOUT_MISSION_COPY_KEY = "about-mission";
const ABOUT_COPY_KEYS = getCopyKeysByPrefix("about-");

function resolveAboutSubtitle(cmsSubtitle: string): string {
  return OWNS_ABOUT_PROSE ? "" : cmsSubtitle;
}

export async function generateMetadata() {
  const about = await getPublicAboutData();

  return buildPublicPageMetadata({
    title: t(msg("About")),
    description:
      resolveAboutSubtitle(about.subtitle) ||
      t(msg("Learn about the {{siteName}} project."), { siteName: SITE_FLAVOR_CONFIG.name }),
    route: { family: "about" },
    socialImage: pageSocialCardImage("about", "About dose.wiki"),
  });
}

export default async function AboutPage() {
  const showOpenData = SITE_FLAVOR_CONFIG.about.showOpenData;
  // Effect Index lists every contributor, ranked by how many pages credit them; dose.wiki keeps
  // its editor-curated founder subset. Only the ranking and full profile table are gated: the
  // curated founder profiles already arrive through `getPublicAboutData()`.
  const showContributorRoster = isEffectIndex();

  const [
    copy,
    about,
    overview,
    substances,
    chemicalLayout,
    mechanismLayout,
    contributorProfiles,
    referenceCounts,
  ] = await Promise.all([
    getCopyByKeys(ABOUT_COPY_KEYS),
    getPublicAboutData(),
    getPublicDataOverview(),
    // The archive preview only renders inside the Open Data tab; skip the read entirely on
    // a flavor that does not show it.
    showOpenData ? getPublicAboutPreviewSubstances() : [],
    getIndexLayoutByType("chemical"),
    getIndexLayoutByType("mechanism"),
    showContributorRoster ? getPublicContributorProfiles() : [],
    showContributorRoster
      ? getPublicContributorReferenceCounts()
      : new Map<string, number>(),
  ]);

  // Ship only the rendered JSON the preview actually needs: the smallest articles
  // complete (within a byte budget), the rest truncated. See aboutArchiveSnapshot.ts.
  const previewSnapshots = buildAboutPreviewSnapshots(
    substances.map(({ slug: _slug, ...article }) => article as SubstanceArticle),
  );

  const chemicalClassCount = chemicalLayout?.categories.length ?? 0;
  const mechanismClassCount = mechanismLayout?.categories.length ?? 0;

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
  const aboutSections = OWNS_ABOUT_PROSE
    ? { introduction: aboutMarkdown, sources: "", history: "" }
    : splitAboutMarkdown(aboutMarkdown);

  const contributors = selectAboutContributors({
    isEffectIndex: showContributorRoster,
    allProfiles: contributorProfiles,
    curatedFounderProfiles: about.founderProfiles,
    referenceCounts,
  });


  return (
    <>
      <EditorLauncherTarget
        target={{ kind: "writing", slug: "about", name: "About", writingKind: "article" }}
      />
      <AboutContentPage
        founderProfiles={contributors.founderProfiles}
        contributorRoster={contributors.roster}
        contributorsSectionTitle={contributors.sectionTitle}
        previewSnapshots={previewSnapshots}
        reuseContent={<CopyBlock copyKey={flavoredCopyKey("about-reuse-notice")}><PublicMarkdownBody content={copy.text(flavoredCopyKey("about-reuse-notice"))} /></CopyBlock>}
        communityIntro={SITE_FLAVOR_CONFIG.about.showCommunity
          ? <CopyBlock copyKey="about-community-intro"><PublicMarkdownBody content={copy.text("about-community-intro")} /></CopyBlock>
          : undefined}
        docBlurbs={!OWNS_ABOUT_PROSE ? copy.items("about-doc-link-blurbs") : undefined}
        docCopyControl={!OWNS_ABOUT_PROSE ? <CopyBlock copyKey="about-doc-link-blurbs" /> : undefined}
        missionContent={OWNS_ABOUT_PROSE
          ? <CopyBlock copyKey={flavoredCopyKey(ABOUT_MISSION_COPY_KEY)}><AboutMissionMarkdown content={aboutMarkdown} /></CopyBlock>
          : <AboutBlock placeholderValues={placeholderValues}><AboutMissionMarkdown content={aboutSections.introduction} /></AboutBlock>}
        sourcesContent={aboutSections.sources
          ? <AboutBlock placeholderValues={placeholderValues} label="Edit sources and review"><AboutMissionMarkdown content={aboutSections.sources} /></AboutBlock>
          : undefined}
        historyContent={aboutSections.history
          ? <AboutBlock placeholderValues={placeholderValues} label="Edit project history"><AboutMissionMarkdown content={aboutSections.history} /></AboutBlock>
          : undefined}
        subtitle={applyPlaceholders(resolveAboutSubtitle(about.subtitle), placeholderValues)}
        subtitleControl={!OWNS_ABOUT_PROSE ? <AboutBlock placeholderValues={placeholderValues} label="Edit About subtitle" /> : undefined}
        downloads={{
          substances: showOpenData ? true : undefined,
          effects: showOpenData ? true : undefined,
          reports: showOpenData ? true : undefined,
          molecules: showOpenData ? getMoleculePackDownloadStats() : undefined,
        }}
      />
    </>
  );
}
