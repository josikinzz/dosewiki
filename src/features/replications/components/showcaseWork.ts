/**
 * The client-facing Replication Showcase contract, kept free of runtime
 * dependencies so client stages (`ReplicationShowcase`, `ArtistShowcase`)
 * can import it without dragging `showcaseModel`'s Zod-backed matcher
 * (`substanceReplicationGallery`) into their bundles.
 * `showcaseModel.buildShowcaseWorks` and `buildEffectShowcaseWorks` produce
 * these on the server.
 */

/**
 * One work of the substance article's Replication Showcase, flattened to the
 * serializable fields the client stage needs. Credit and rights lines are
 * composed by `buildShowcaseWorks` with the shared replication-credit helpers
 * so the showcase reads identically to the gallery tiles and the permalink
 * page, and so the client bundle carries strings rather than the whole Postgres
 * record.
 */
export type ShowcaseWork = {
  slug: string;
  title: string;
  type: "video" | "image";
  url: string;
  thumbnailUrl?: string;
  format?: string;
  duration?: number;
  /** True = audible signal; false = no signal; absent = unprobed. */
  hasAudio?: boolean;
  width?: number;
  height?: number;
  previewUrl?: string;
  motionUrl?: string;
  motionPosterUrl?: string;
  /**
   * English "by <artist>" or "Creator unknown" — never prepend another "by".
   * The client stage renders its own credit from `artistName` through `t()`,
   * so the mirror's chrome reads in the UI locale.
   */
  byline: string;
  /** Trimmed credited name, null when the credit names nobody. */
  artistName: string | null;
  /**
   * Where the artist's name links: their Artist Page when this work proves one
   * exists, else the `resolveArtistFallbackHref` answer (a claimed contributor
   * profile — live for exactly the artists with no page), else their own site
   * (`artist_url`), else nowhere. Same policy as the permalink page's byline.
   */
  artistHref: string | null;
  /** True when `artistHref` leaves the site (the `artist_url` fallback). */
  artistHrefExternal: boolean;
  /** The claiming Contributor Profile's avatar, when one claims the credit. */
  avatarUrl?: string | null;
  effectSlug: string;
  effectName: string;
};

/**
 * How many works the article showcase renders. The matcher can return the
 * whole per-effect corpus (LSD matches ~90); an inline figure gets the
 * curated head of that list and hands the rest to the gallery. Editors pick
 * *which* works fill these slots via the curation portal's ordering.
 */
export const SHOWCASE_WORK_CAP = 12;
