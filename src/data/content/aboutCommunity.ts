/**
 * Structural data for the About page's Partners & Community section
 * (dose.wiki flavor only — see `SiteAboutConfig.showCommunity`).
 *
 * This module owns the structure: names, links, logos, and tiers. The one-line
 * blurbs are editable copy blocks (group "About" in
 * src/data/content/copyBlocks.json, keys `about-community-*`), resolved
 * server-side by the About route and passed down as plain strings.
 *
 * Logo provenance: consciousness-library from josiekins.xyz/images/shared/,
 * tripsit from tripsit.me, protestkit from protestkit.eu. Subreddits render an
 * `r/` monogram tile: Reddit serves no stable anonymous icon endpoint.
 */

/** How a partner's tile is filled. */
export type CommunityLogo =
  | {
      kind: "image";
      src: string;
      /**
       * `contain` letterboxes inside the tile (default). `cover` bleeds the
       * artwork to the tile edges — for square app-icon marks that carry
       * their own background. `wide` fits a wordmark by width.
       */
      fit?: "contain" | "cover" | "wide";
    }
  | { kind: "monogram"; text: string };

export type CommunityLink = {
  /** Stable id; also the tail of the entry's copy-block key. */
  key: string;
  name: string;
  href: string;
  /** Display domain under the name. */
  domain: string;
  logo: CommunityLogo;
  /** Copy-block key for the one-line blurb. */
  copyKey: string;
};


export type CommunityDataPartner = CommunityLink & {
  /** Short badge naming the data this partner ships on the site. */
  dataTag: string;
};

const LOGO_BASE = "/about/community";


export const ABOUT_COMMUNITY_SISTERS: readonly CommunityLink[] = [
  {
    key: "replications",
    name: "r/replications",
    href: "https://reddit.com/r/replications",
    domain: "reddit.com",
    logo: { kind: "monogram", text: "r/" },
    copyKey: "about-community-replications",
  },
  {
    key: "consciousness-library",
    name: "Consciousness Library",
    href: "https://consciousnesslibrary.org",
    domain: "consciousnesslibrary.org",
    logo: { kind: "image", src: `${LOGO_BASE}/consciousness-library.svg` },
    copyKey: "about-community-consciousness-library",
  },
];

export const ABOUT_COMMUNITY_DATA_PARTNERS: readonly CommunityDataPartner[] = [
  {
    key: "tripsit",
    name: "TripSit",
    href: "https://tripsit.me",
    domain: "tripsit.me",
    logo: { kind: "image", src: `${LOGO_BASE}/tripsit.webp`, fit: "wide" },
    copyKey: "about-community-tripsit",
    dataTag: "Interaction data",
  },
  {
    key: "protestkit",
    name: "PRO Test Kit",
    href: "https://protestkit.eu",
    domain: "protestkit.eu",
    logo: { kind: "image", src: `${LOGO_BASE}/protestkit.webp` },
    copyKey: "about-community-protestkit",
    dataTag: "Reagent data",
  },
];

export const ABOUT_COMMUNITY_FRIENDS: readonly CommunityLink[] = [
  {
    key: "r-drugs",
    name: "r/drugs",
    href: "https://reddit.com/r/drugs",
    domain: "reddit.com",
    logo: { kind: "monogram", text: "r/" },
    copyKey: "about-community-r-drugs",
  },
  {
    key: "r-researchchemicals",
    name: "r/researchchemicals",
    href: "https://reddit.com/r/researchchemicals",
    domain: "reddit.com",
    logo: { kind: "monogram", text: "r/" },
    copyKey: "about-community-r-researchchemicals",
  },
];

/** Every copy-block key the section reads, for the route's blurb resolution. */
export const ABOUT_COMMUNITY_COPY_KEYS: readonly string[] = [
  ...ABOUT_COMMUNITY_SISTERS.map((entry) => entry.copyKey),
  ...ABOUT_COMMUNITY_DATA_PARTNERS.map((entry) => entry.copyKey),
  ...ABOUT_COMMUNITY_FRIENDS.map((entry) => entry.copyKey),
];
