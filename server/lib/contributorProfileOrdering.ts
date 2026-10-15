export const MAX_ORDER_SLUGS = 500;

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
