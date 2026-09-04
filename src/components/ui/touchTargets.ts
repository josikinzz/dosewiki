/**
 * The repo's coarse-pointer touch floor: controls stay compact on a mouse and
 * grow to 44px where a finger is the pointer. `button.tsx`'s compact sizes
 * carry the same recipe; these are for call sites that size themselves.
 */
export const TOUCH_PILL = "[@media(pointer:coarse)]:min-h-11";
export const TOUCH_ICON = "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";
