/**
 * Structural data for the About page's Partners & Community section
 * (dose.wiki flavor only — see `SiteAboutConfig.showCommunity`).
 *
 * One flat roster, alphabetized by name: names, links, and logo artwork.
 * Descriptive copy was deliberately removed pending a rewrite; when it
 * returns it should come back as editable copy blocks like the rest of the
 * About page, not as literals here.
 *
 * Logo provenance: anodyne from anodyne.wiki/assets/logo.png, erowid from
 * erowid.org's favicon, bluelight from bluelight.org's touch icon,
 * psychonautwiki from psychonautwiki.rip's favicon,
 * consciousness-library and effectindex from
 * josiekins.xyz/images/shared/, tripsit from tripsit.me, protestkit from
 * protestkit.eu, drug-users-bible from the drugusersbible.org cover art;
 * the r-* tiles are each subreddit's Reddit community avatar. nervewing is
 * the blog's header drawing (an antlion) cropped from nervewing.blogspot.com;
 * substance-search is Google's Noto Color Emoji pill (U+1F48A, Apache-2.0),
 * the same glyph substancesearch.com uses as its favicon, since the site has
 * no logo beyond that emoji.
 */

/** How an entry's tile artwork is fitted. */
export type CommunityLogo = {
  src: string;
  /**
   * `contain` letterboxes inside the tile (default). `cover` bleeds the
   * artwork to the tile edges — for square avatar marks that carry their
   * own background. `wide` fits landscape artwork (a wordmark, a drawing)
   * by width.
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
    key: "anodyne",
    name: "AnodyneWiki",
    href: "https://anodyne.wiki",
    logo: { src: `${LOGO_BASE}/anodyne.webp`, fit: "cover" },
  },
  {
    key: "bluelight",
    name: "Bluelight",
    href: "https://bluelight.org",
    logo: { src: `${LOGO_BASE}/bluelight.webp` },
  },
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
    key: "erowid",
    name: "Erowid",
    href: "https://www.erowid.org",
    logo: { src: `${LOGO_BASE}/erowid.webp` },
  },
  {
    key: "nervewing",
    name: "Nervewing",
    href: "https://nervewing.blogspot.com",
    logo: { src: `${LOGO_BASE}/nervewing.webp`, fit: "wide" },
  },
  {
    key: "protestkit",
    name: "PRO Test Kit",
    href: "https://protestkit.eu",
    logo: { src: `${LOGO_BASE}/protestkit.webp` },
  },
  {
    key: "psychonautwiki",
    name: "PsychonautWiki",
    href: "https://psychonautwiki.rip",
    logo: { src: `${LOGO_BASE}/psychonautwiki.webp` },
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
    key: "substance-search",
    name: "Substance Search",
    href: "https://substancesearch.com",
    logo: { src: `${LOGO_BASE}/substance-search.svg` },
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
