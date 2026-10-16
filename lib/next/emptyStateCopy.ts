import "server-only";

import type { CopyResolver } from "./copyBlocks";
import type { PublicRouteEmptyState } from "./publicRouteOutcomes";

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
