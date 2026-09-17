import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The corner roles (src/styles/base.css) are Tailwind aliases, so a caller's
 * `rounded-full` must still beat a primitive's `rounded-control` by merge
 * order rather than by stylesheet order.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ["control", "chip", "card", "panel", "pill"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
