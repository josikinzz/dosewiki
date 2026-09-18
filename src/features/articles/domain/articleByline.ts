/**
 * One resolved article byline entry.
 *
 * An Effect Index article's stored `authors` field is the legacy Mongo dump's
 * raw 24-character ObjectIds, which name nobody a reader recognises. The
 * displayable identity is `authorProfileKeys`, and the route loader turns each
 * key into this shape by looking the contributor profile up: a name to print
 * and the profile page to link it to. A key no profile claims produces no
 * entry, so an article with nothing resolvable renders no byline.
 */
export interface ArticleBylineAuthor {
  /** Canonical contributor profile key, e.g. `JOSIE`. */
  key: string;
  /** The contributor's display name, as their profile spells it. */
  name: string;
  /** Path to their contributor page. */
  href: string;
  /**
   * The profile's avatar, so an attribution chip under the author's own
   * commentary can show their face. Absent when the profile has none.
   */
  avatarSrc?: string;
}
