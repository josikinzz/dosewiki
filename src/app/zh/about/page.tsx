/**
 * The Simplified Chinese mirror of `/about`, reached only through the
 * middleware rewrite from `zh.dose.wiki/about`. Same data and layout; the
 * mission markdown splits on the English H2s exactly as the English page
 * does, then each section body renders through the catalog (with its
 * `{{placeholder}}` counts filled after lookup) and falls back to English
 * wherever the catalog lacks a section. The mirror carries `noindex` and a
 * canonical link back to the English About page.
 */
import {
  getIndexLayoutByType,
  getPublicAboutPreviewSubstances,
  getPublicAboutData,
  getPublicDataOverview,
} from "@server/data/publicData";
import { getMoleculePackDownloadStats } from "@server/open-data/downloadStats";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { flavoredCopyKey, getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import { applyPlaceholders } from "@/data/content/about";
import { splitAboutMarkdown } from "@/data/content/aboutSections";
import { selectAboutContributors } from "@/data/contributorRoster";
import { AboutMissionMarkdown } from "@/components/pages/AboutMissionMarkdown";
import { AboutPage as AboutContentPage } from "@/components/pages/AboutPage";
import { buildAboutPreviewSnapshots } from "@/components/pages/aboutArchiveSnapshot";
import type { SubstanceArticle } from "@/schema";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";
import { msg } from "@/i18n/messages";
import { setRequestLocale, t } from "@/i18n/server";
import { UiLocaleProvider } from "@/i18n/client"
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];
const ABOUT_COPY_KEYS = getCopyKeysByPrefix("about-");

function resolveAboutSubtitle(cmsSubtitle: string): string {
  // dose.wiki never owns its About prose; see the English page.
  return cmsSubtitle;
}

export async function generateMetadata() {
  setRequestLocale(LOCALE.code);
  const about = await getPublicAboutData();

  return buildPublicPageMetadata({
    title: t(msg("About")),
    description:
      t(resolveAboutSubtitle(about.subtitle)) ||
      t(msg("Learn about the {{siteName}} project."), { siteName: SITE_FLAVOR_CONFIG.name }),
    route: { family: "about" },
    noIndex: true,
    socialImage: pageSocialCardImage("about", "About dose.wiki"),
  });
}

export default async function LocalizedAboutPage() {
  setRequestLocale(LOCALE.code);

  const [
    copy,
    about,
    overview,
    substances,
    chemicalLayout,
    mechanismLayout,
  ] = await Promise.all([
    getCopyByKeys(ABOUT_COPY_KEYS),
    getPublicAboutData(),
    getPublicDataOverview(),
    getPublicAboutPreviewSubstances(),
    getIndexLayoutByType("chemical"),
    getIndexLayoutByType("mechanism"),
  ]);

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

  // Split on the English H2s first — the split is the structural boundary —
  // then translate each section body through the catalog and fill the count
  // placeholders afterwards, so the catalog keys keep their `{{name}}` tokens.
  const aboutSections = splitAboutMarkdown(about.markdown);

  const contributors = selectAboutContributors({
    isEffectIndex: false,
    allProfiles: [],
    curatedFounderProfiles: about.founderProfiles,
    referenceCounts: new Map<string, number>(),
  });

  const localizedBody = (content: string) =>
    applyPlaceholders(t(content, placeholderValues), placeholderValues);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <AboutContentPage
          founderProfiles={contributors.founderProfiles}
          contributorRoster={contributors.roster}
          contributorsSectionTitle={contributors.sectionTitle}
          previewSnapshots={previewSnapshots}
          reuseContent={
            <PublicMarkdownBody content={localizedBody(copy.text(flavoredCopyKey("about-reuse-notice")))} />
          }
          communityIntro={
            <PublicMarkdownBody content={localizedBody(copy.text("about-community-intro"))} />
          }
          docBlurbs={copy.items("about-doc-link-blurbs")}
          missionContent={<AboutMissionMarkdown content={localizedBody(aboutSections.introduction)} />}
          sourcesContent={
            aboutSections.sources ? (
              <AboutMissionMarkdown content={localizedBody(aboutSections.sources)} />
            ) : undefined
          }
          historyContent={
            aboutSections.history ? (
              <AboutMissionMarkdown content={localizedBody(aboutSections.history)} />
            ) : undefined
          }
          subtitle={applyPlaceholders(t(resolveAboutSubtitle(about.subtitle), placeholderValues), placeholderValues)}
          downloads={{
            substances: true,
            effects: true,
            reports: true,
            molecules: getMoleculePackDownloadStats(),
          }}
        />
      </div>
    </UiLocaleProvider>
  );
}