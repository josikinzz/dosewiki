export const TOUCH_PILL = "[@media(pointer:coarse)]:min-h-11";
export const TOUCH_ICON = "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

export const TOUCH_HALO =
  "relative before:absolute before:left-1/2 before:top-1/2 before:h-full before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] [@media(pointer:coarse)]:before:min-h-11 [@media(pointer:coarse)]:before:min-w-11";

export const TOUCH_HALO_Y =
  "relative before:absolute before:inset-x-0 before:top-1/2 before:h-full before:-translate-y-1/2 before:content-[''] [@media(pointer:coarse)]:before:min-h-11";
