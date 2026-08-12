import "server-only";

import type { CopyResolver } from "./copyBlocks";
import type { PublicRouteEmptyState } from "./publicRouteOutcomes";

/**
 * Overlays editable copy onto a route's empty state.
 *
 * The empty states are module constants shared by the route loaders, so rather
 * than making every loader copy-aware the owning page overlays them just before
 * render. Each field reads `empty-<name>-badge|title|description` and keeps the
 * constant as its fallback, which is what the checked-in copy defaults hold —
 * so an un-seeded deployment renders the constant unchanged.
 */
export function resolveEmptyStateCopy(
  copy: CopyResolver,
  name: string,
  fallback: PublicRouteEmptyState | undefined,
): PublicRouteEmptyState | undefined {
  if (!fallback) {
    return fallback;
  }

  return {
    ...fallback,
    badge: copy.text(`empty-${name}-badge`) || fallback.badge,
    title: copy.text(`empty-${name}-title`) || fallback.title,
    description: copy.text(`empty-${name}-description`) || fallback.description,
  };
}
