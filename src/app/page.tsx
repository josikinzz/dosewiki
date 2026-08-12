import type { Metadata } from "next";
import { env } from "node:process";
import { loadEffectIndexHomeData } from "@server/next/effectIndexHome";
import { SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import { EffectIndexHomePage } from "@/features/effect-index/home/EffectIndexHomePage";
import { HomeExperience } from "./_components/HomeExperience";
import { buildHomeQuickLinks } from "./_components/homeQuickLinks";
import { flavoredCopyText, getCopy } from "@server/next/copyBlocks";

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
 * The two publications do not share a homepage.
 *
 * dose.wiki's is the centred wordmark over the app-tile grid (`HomeExperience`). Effect
 * Index's is the original effectindex.com front page: an intro block over two columns of
 * content panels. The flavor is a build-time constant, so only one of these two branches is
 * ever reachable in a given build — the dose.wiki path below is byte-for-byte what it was.
 *
 * The holding page takes precedence on either flavor: under construction mode the tile-grid
 * mock is what the site is meant to show, so it stays in front of the panel layout too.
 */
export default async function HomePage() {
  const isConstructionMode = env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true";

  if (isEffectIndex() && !isConstructionMode) {
    return <EffectIndexHomePage {...(await loadEffectIndexHomeData())} />;
  }

  const copy = await getCopy();

  return (
    <HomeExperience
      quickLinks={quickLinks}
      isConstructionMode={isConstructionMode}
      copy={{
        tagline: flavoredCopyText(
          copy,
          "home-hero-tagline",
          SITE_FLAVOR_CONFIG.description,
        ),
        constructionTitle: copy.text("home-construction-title"),
        constructionSubtitle: copy.text("home-construction-subtitle"),
      }}
    />
  );
}
