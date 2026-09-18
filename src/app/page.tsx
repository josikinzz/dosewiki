import type { Metadata } from "next";
import { loadEffectIndexHomeData } from "@server/next/effectIndexHome";
import { SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import { EffectIndexHomePage } from "@/features/effect-index/home/EffectIndexHomePage";
import {
  EFFECT_INDEX_HOME_INTRO_FALLBACK,
  EFFECT_INDEX_HOME_INTRO_COPY_KEYS,
  EFFECT_INDEX_HOME_PANEL_BLURBS_KEY,
  type EffectIndexHomeCopy,
} from "@/features/effect-index/home/homeIntroCopy";
import { HomeExperience } from "./_components/HomeExperience";
import { buildHomeQuickLinks } from "./_components/homeQuickLinks";
import {
  flavoredCopyKey,
  flavoredCopyText,
  getCopyByKeys,
  type CopyResolver,
} from "@server/next/copyBlocks";
import { PUBLIC_SITE, buildSiteAssetUrl, buildSiteUrl } from "@server/next/publicSite";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

// The homepage keeps its bare title suffix rather than the public metadata builder's
// `<page> - <suffix>` convention. Its tailored dose.wiki card is overlaid here so other
// routes without their own card continue to inherit the publication-wide root asset.
export async function generateMetadata(): Promise<Metadata> {
  const copy = await getCopyByKeys([flavoredCopyKey("home-hero-tagline")]);
  const description = flavoredCopyText(
    copy,
    "home-hero-tagline",
    SITE_FLAVOR_CONFIG.description,
  );
  const socialImage = pageSocialCardImage("home", "dose.wiki home");

  return {
    title: SITE_FLAVOR_CONFIG.homeTitle,
    description,
    ...(socialImage
      ? {
          openGraph: {
            type: "website" as const,
            siteName: PUBLIC_SITE.name,
            title: SITE_FLAVOR_CONFIG.rootMetadata.title,
            description,
            url: buildSiteUrl("/"),
            images: [
              {
                url: buildSiteAssetUrl(socialImage.path),
                width: socialImage.width,
                height: socialImage.height,
                alt: socialImage.alt,
              },
            ],
          },
          twitter: {
            card: "summary" as const,
            title: SITE_FLAVOR_CONFIG.rootMetadata.title,
            description,
            images: [buildSiteAssetUrl(socialImage.path)],
          },
        }
      : {}),
  };
}

const quickLinks = buildHomeQuickLinks();

/**
 * The Effect Index homepage's editable prose.
 *
 * These keys are Effect Index's own — the slots exist on no other flavor — so they are read
 * directly rather than through `flavoredCopyKey`, and each falls back to the string the
 * component shipped with when neither Postgres nor the checked-in defaults hold a row.
 */
function resolveEffectIndexHomeCopy(copy: CopyResolver): EffectIndexHomeCopy {
  const paragraph = (
    key: (typeof EFFECT_INDEX_HOME_INTRO_COPY_KEYS)[keyof typeof EFFECT_INDEX_HOME_INTRO_COPY_KEYS],
    fallback: string,
  ) => copy.get(key)?.body?.trim() || fallback;

  return {
    intro: {
      lead: paragraph(
        EFFECT_INDEX_HOME_INTRO_COPY_KEYS.lead,
        EFFECT_INDEX_HOME_INTRO_FALLBACK.lead,
      ),
      method: paragraph(
        EFFECT_INDEX_HOME_INTRO_COPY_KEYS.method,
        EFFECT_INDEX_HOME_INTRO_FALLBACK.method,
      ),
      organisation: paragraph(
        EFFECT_INDEX_HOME_INTRO_COPY_KEYS.organisation,
        EFFECT_INDEX_HOME_INTRO_FALLBACK.organisation,
      ),
    },
    panelBlurbs: copy.items(EFFECT_INDEX_HOME_PANEL_BLURBS_KEY),
  };
}

/**
 * The two publications do not share a homepage.
 *
 * dose.wiki's is the centred wordmark over the app-tile grid (`HomeExperience`). Effect
 * Index's is the original effectindex.com front page: an intro block over two columns of
 * content panels. The flavor is a build-time constant, so only one of these two branches is
 * ever reachable in a given build — the dose.wiki path below is byte-for-byte what it was.
 */
export default async function HomePage() {
  if (isEffectIndex()) {
    const [copy, homeData] = await Promise.all([
      getCopyByKeys([
        ...Object.values(EFFECT_INDEX_HOME_INTRO_COPY_KEYS),
        EFFECT_INDEX_HOME_PANEL_BLURBS_KEY,
      ]),
      loadEffectIndexHomeData(),
    ]);

    return (
      <EffectIndexHomePage
        {...homeData}
        copy={resolveEffectIndexHomeCopy(copy)}
      />
    );
  }

  const copy = await getCopyByKeys([flavoredCopyKey("home-hero-tagline")]);

  return (
    <HomeExperience
      quickLinks={quickLinks}
      copy={{
        tagline: flavoredCopyText(
          copy,
          "home-hero-tagline",
          SITE_FLAVOR_CONFIG.description,
        ),
      }}
    />
  );
}
