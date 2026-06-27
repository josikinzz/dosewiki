import "server-only";

import { cache } from "react";
import { api } from "../../convex/_generated/api";
import { getServerConvexReadClient } from "./serverClient";

/** Map of substance slug → override `updatedAt`, used to cache-bust the image URL. */
export type MoleculeOverrideIndex = Map<string, string>;

/**
 * The slugs that currently have a hand-authored molecule override, with their
 * last-updated timestamps. Overrides are rare, so this is a small read; it's
 * cached per render and resolves to an empty map if Convex is unavailable, so a
 * lookup failure never breaks a substance page (it just keeps the static asset).
 */
export const getMoleculeOverrideIndex = cache(async (): Promise<MoleculeOverrideIndex> => {
  try {
    const rows = await getServerConvexReadClient().query(api.moleculeOverrides.listSlugs, {});
    return new Map(rows.map((row) => [row.slug, row.updatedAt]));
  } catch {
    return new Map();
  }
});

/** The public image-route URL for a slug's override, busted by `updatedAt`. */
export function moleculeOverrideImageUrl(slug: string, updatedAt: string): string {
  return `/api/molecules/${slug}?v=${encodeURIComponent(updatedAt)}`;
}
