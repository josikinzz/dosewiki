import { useMediaQuery } from "./useMediaQuery";

/**
 * Reactive read of the user's `prefers-reduced-motion` setting. SSR-safe
 * (returns `false` until mounted) and updates if the OS preference flips while
 * the page is open. Use this to gate JS-driven motion; pure-CSS motion should
 * gate itself with an `@media (prefers-reduced-motion: …)` block instead.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
