import communitySource from "@content/about/community.json";

/**
 * Structural data for the About page's Partners & Community section
 * (dose.wiki flavor only; see `SiteAboutConfig.showCommunity`).
 *
 * The roster itself lives in `content/about/community.json`: one flat list,
 * alphabetized by name, holding names, links, and logo artwork paths under
 * `public/about/community/`. Descriptive copy was deliberately removed
 * pending a rewrite; when it returns it should come back as editable copy
 * blocks like the rest of the About page, not as literals here.
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
   * artwork to the tile edges, for square avatar marks that carry their
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

/** The combined partner and community roster. */
export const ABOUT_COMMUNITY_LINKS: readonly CommunityLink[] = communitySource as CommunityLink[];
