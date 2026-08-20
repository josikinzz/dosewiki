import type { Metadata } from "next";
import { env } from "node:process";
import { loadEffectIndexHomeData } from "@server/next/effectIndexHome";
import { SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import { EffectIndexHomePage } from "@/features/effect-index/home/EffectIndexHomePage";
import {
  EFFECT_INDEX_HOME_INTRO_FALLBACK,
  EFFECT_INDEX_HOME_INTRO_COPY_KEYS,
  EFFECT_INDEX_HOME_PANEL_BLURBS_KEY,
  type EffectIndexHomeCopy,
} from "@/features/effect-index/home/homeIntroCopy";
import { ConstructionLanding } from "./_components/ConstructionLanding";
import { HomeExperience } from "./_components/HomeExperience";
import { buildHomeQuickLinks } from "./_components/homeQuickLinks";
import { flavoredCopyText, getCopy, type CopyResolver } from "@server/next/copyBlocks";

// The homepage deliberately does not route through buildPublicPageMetadata: its Open
// Graph card is inherited from the root layout's flavored metadata block. Only the title
// and description are overridden here, and both come from the site flavor config.
export async function generateMetadata(): Promise<Metadata> {
  const isConstructionMode = env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true";
  const copy = await getCopy();

  return {
    title: SITE_FLAVOR_CONFIG.homeTitle,
    description: flavoredCopyText(
      copy,
      "home-hero-tagline",
      SITE_FLAVOR_CONFIG.description,
    ),
    robots: isConstructionMode
      ? {
          index: false,
          follow: false,
        }
      : undefined,
  };
}

const quickLinks = buildHomeQuickLinks();

/**
 * The Effect Index homepage's editable prose.
 *
 * These keys are Effect Index's own — the slots exist on no other flavor — so they are read
 * directly rather than through `flavoredCopyKey`, and each falls back to the string the
 * component shipped with when neither Convex nor the checked-in defaults hold a row.
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
 *
 * The holding page takes precedence on either flavor: under construction mode the whole
 * deployment is held back, so `ConstructionLanding` — the same blocked surface the
 * construction hosts reach at `/under-construction` — stays in front of both layouts.
 */
export default async function HomePage() {
  if (env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true") {
    return <ConstructionLanding />;
  }

  const copy = await getCopy();

  if (isEffectIndex()) {
    return (
      <EffectIndexHomePage
        {...(await loadEffectIndexHomeData())}
        copy={resolveEffectIndexHomeCopy(copy)}
      />
    );
  }

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
