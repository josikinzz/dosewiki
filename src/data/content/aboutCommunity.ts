/**
 * Structural data for the About page's Partners & Community section
 * (dose.wiki flavor only — see `SiteAboutConfig.showCommunity`).
 *
 * One flat roster, alphabetized by name: names, links, and logo artwork.
 * Descriptive copy was deliberately removed pending a rewrite; when it
 * returns it should come back as editable copy blocks like the rest of the
 * About page, not as literals here.
 *
 * Logo provenance: consciousness-library and effectindex from
 * josiekins.xyz/images/shared/, tripsit from tripsit.me, protestkit from
 * protestkit.eu, drug-users-bible from the drugusersbible.org cover art;
 * the r-* tiles are each subreddit's Reddit community avatar.
 */

/** How an entry's tile artwork is fitted. */
export type CommunityLogo = {
  src: string;
  /**
   * `contain` letterboxes inside the tile (default). `cover` bleeds the
   * artwork to the tile edges — for square avatar marks that carry their
   * own background. `wide` fits a wordmark by width.
   */
  fit?: "contain" | "cover" | "wide";
};

export type CommunityLink = {
  /** Stable id. */
  key: string;
  name: string;
  href: string;
  logo: CommunityLogo;
};

const LOGO_BASE = "/about/community";

/** The combined partner and community roster. */
export const ABOUT_COMMUNITY_LINKS: readonly CommunityLink[] = [
  {
    key: "consciousness-library",
    name: "Consciousness Library",
    href: "https://consciousnesslibrary.org",
    logo: { src: `${LOGO_BASE}/consciousness-library.svg` },
  },
  {
    key: "effect-index",
    name: "Effect Index",
    href: "https://effectindex.com",
    logo: { src: `${LOGO_BASE}/effectindex.webp`, fit: "cover" },
  },
  {
    key: "protestkit",
    name: "PRO Test Kit",
    href: "https://protestkit.eu",
    logo: { src: `${LOGO_BASE}/protestkit.webp` },
  },
  {
    key: "r-drugs",
    name: "r/drugs",
    href: "https://reddit.com/r/drugs",
    logo: { src: `${LOGO_BASE}/r-drugs.webp`, fit: "cover" },
  },
  {
    key: "r-replications",
    name: "r/replications",
    href: "https://reddit.com/r/replications",
    logo: { src: `${LOGO_BASE}/r-replications.webp`, fit: "cover" },
  },
  {
    key: "r-researchchemicals",
    name: "r/researchchemicals",
    href: "https://reddit.com/r/researchchemicals",
    logo: { src: `${LOGO_BASE}/r-researchchemicals.webp`, fit: "cover" },
  },
  {
    key: "drug-users-bible",
    name: "The Drug Users Bible",
    href: "https://archive.org/details/the-drug-users-bible-harm-reduction-dominic-milton-trott",
    logo: { src: `${LOGO_BASE}/drug-users-bible.webp` },
  },
  {
    key: "tripsit",
    name: "TripSit",
    href: "https://tripsit.me",
    logo: { src: `${LOGO_BASE}/tripsit.webp`, fit: "wide" },
  },
];
