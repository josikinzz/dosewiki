/**
 * The repo's coarse-pointer touch floor: controls stay compact on a mouse and
 * grow to 44px where a finger is the pointer. `button.tsx`'s compact sizes
 * carry the same recipe; these are for call sites that size themselves.
 */
export const TOUCH_PILL = "[@media(pointer:coarse)]:min-h-11";
export const TOUCH_ICON = "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

/**
 * An invisible 44px floor. The visible control keeps its compact geometry on
 * every pointer; a centered `::before` pseudo-element grows the hit area to
 * 44px in both axes under a coarse pointer. Use this for disclosure glyphs and
 * chips that sit inside prose or other chips, where a rendered 44px box would
 * inflate the parent. The host element must not already own `::before`.
 */
export const TOUCH_HALO =
  "relative before:absolute before:left-1/2 before:top-1/2 before:h-full before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] [@media(pointer:coarse)]:before:min-h-11 [@media(pointer:coarse)]:before:min-w-11";

/**
 * The vertical half of `TOUCH_HALO`, for controls that sit shoulder to
 * shoulder in one row, such as the citation backlink numerals. A full 44px
 * halo on each neighbour would overlap and let the later sibling steal the
 * tap, so the row keeps its own horizontal spacing and only the height grows.
 */
export const TOUCH_HALO_Y =
  "relative before:absolute before:inset-x-0 before:top-1/2 before:h-full before:-translate-y-1/2 before:content-[''] [@media(pointer:coarse)]:before:min-h-11";
