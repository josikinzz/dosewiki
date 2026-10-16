import { readPublicLanguageDirectory } from "@server/translation/publicGlossary";
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
      languages={await readPublicLanguageDirectory()}
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
