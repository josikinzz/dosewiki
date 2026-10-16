export function applyCuratedOrder<T>(
  items: readonly T[],
  curatedSlugs: readonly string[] | undefined | null,
  slugOf: (item: T) => string,
): T[] {
  if (!curatedSlugs?.length) {
    return [...items];
  }

  const rank = new Map<string, number>();
  for (const slug of curatedSlugs) {
    if (slug && !rank.has(slug)) {
      rank.set(slug, rank.size);
    }
  }

  if (rank.size === 0) {
    return [...items];
  }

  const curated: T[] = [];
  const rest: T[] = [];

  for (const item of items) {
    if (rank.has(slugOf(item))) curated.push(item);
    else rest.push(item);
  }

  curated.sort((a, b) => (rank.get(slugOf(a)) ?? 0) - (rank.get(slugOf(b)) ?? 0));

  return [...curated, ...rest];
}
