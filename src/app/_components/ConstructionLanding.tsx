import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { flavoredCopyText, getCopy } from "@server/next/copyBlocks";
import { HomeExperience } from "./HomeExperience";
import { buildHomeQuickLinks } from "./homeQuickLinks";

const quickLinks = buildHomeQuickLinks();

/**
 * The pre-launch holding page: the live homepage, with every destination blocked.
 *
 * There is one blocked surface, not two. It is reachable two ways because the gate itself
 * is: the construction hosts (`dose.wiki`, `www.dose.wiki`) are rewritten to
 * `/under-construction` by the middleware, which is per-request and so the only mechanism
 * that can hold one host back while the same build serves the full site on another; a
 * whole deployment can additionally be held back at `/` with
 * `NEXT_PUBLIC_HOME_CONSTRUCTION_MODE`, which is build-time. Both render this.
 *
 * Rendering the real homepage rather than a bespoke holding card is the point: a visitor
 * sees the site they will get, in the appearance they will get it, and the tiles answer
 * "SOON" instead of navigating. The Theme Lab is the one control the blocked surface
 * withholds — see {@link HomeExperience}.
 */
export async function ConstructionLanding() {
  const copy = await getCopy();

  return (
    <HomeExperience
      quickLinks={quickLinks}
      isConstructionMode
      copy={{
        tagline: flavoredCopyText(copy, "home-hero-tagline", SITE_FLAVOR_CONFIG.description),
        constructionTitle: copy.text("home-construction-title"),
        constructionSubtitle: copy.text("home-construction-subtitle"),
      }}
    />
  );
}
