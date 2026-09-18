/**
 * Partial curation, shared by every surface that renders a contributor-ordered
 * list (`contributorProfiles.replicationOrder` / `reportOrder`).
 *
 * The contract is deliberately narrow so the surfaces cannot drift apart:
 * the curated slugs come first, in exactly the order they were listed, and
 * everything the curation does not mention follows in the order it arrived in —
 * which is that surface's own default sort, applied before this runs. A slug
 * that matches nothing in `items` is ignored rather than leaving a hole, so a
 * deleted work or report cannot survive as a phantom position; a duplicate slug
 * places its item once, at its first mention.
 *
 * With no curation (empty or absent list) the input order is returned unchanged,
 * which is the common case — a contributor who has never curated anything must
 * see exactly the ordering the surface had before curation existed.
 */
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

  // Stable within each side: the curated run follows the curated list, and the
  // remainder keeps the incoming default sort untouched.
  curated.sort((a, b) => (rank.get(slugOf(a)) ?? 0) - (rank.get(slugOf(b)) ?? 0));

  return [...curated, ...rest];
}
