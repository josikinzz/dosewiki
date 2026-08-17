/** Upper bound on a curated ordering, so one write cannot pin an unbounded list. */
export const MAX_ORDER_SLUGS = 500;

/**
 * Trim, drop blanks, and de-duplicate an ordering while preserving the caller's
 * order. Slugs are compared exactly rather than case-folded: the tables store
 * lowercase URL slugs, and lowercasing here would silently rewrite — and then
 * prune — anything that did not follow that convention.
 */
export function normalizeOrderSlugs(values: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values ?? []) {
    const slug = typeof value === "string" ? value.trim() : "";
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    ordered.push(slug);
    if (ordered.length >= MAX_ORDER_SLUGS) {
      break;
    }
  }

  return ordered;
}

/**
 * Split a requested ordering into the slugs that still resolve to a row and the
 * stale ones. Curation is partial: the surviving slugs render first in this
 * order and every unlisted item follows in its existing default sort, so a
 * pruned slug costs nothing but its own position.
 */
export function pruneOrderSlugs(
  requested: readonly string[] | null | undefined,
  knownSlugs: Iterable<string>,
): { order: string[]; pruned: string[] } {
  const known = new Set(knownSlugs);
  const order: string[] = [];
  const pruned: string[] = [];

  for (const slug of normalizeOrderSlugs(requested)) {
    if (known.has(slug)) {
      order.push(slug);
    } else {
      pruned.push(slug);
    }
  }

  return { order, pruned };
}
