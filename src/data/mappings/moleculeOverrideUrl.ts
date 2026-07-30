/**
 * URL builders for the canonical Convex molecule depictions, kept free of
 * server-only imports so client surfaces (e.g. the review workbench) can
 * version the same public image routes the server view models use.
 */

/** The public image-route URL for a slug's override, busted by `updatedAt`. */
export function moleculeOverrideImageUrl(slug: string, updatedAt: string): string {
  return `/api/molecules/${slug}?v=${encodeURIComponent(updatedAt)}`;
}

/** The public image-route URL for a chemical class override, busted by `updatedAt`. */
export function classStructureOverrideImageUrl(key: string, updatedAt: string): string {
  return `/api/molecules/classes/${key}?v=${encodeURIComponent(updatedAt)}`;
}
