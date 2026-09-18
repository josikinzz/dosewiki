/**
 * The public paths a production save invalidates. Pure and dependency-free so
 * the Next save route and the native change-proposal apply derive the same
 * list: every article path the ingestion reported, plus the index pages a
 * layout write redraws.
 */
export type IndexLayoutType = "psychoactive" | "chemical" | "mechanism";

export function indexLayoutRevalidationPath(type: IndexLayoutType): string {
  switch (type) {
    case "chemical":
      return "/chemical";
    case "mechanism":
      return "/mechanism";
    case "psychoactive":
      return "/substances";
  }
}

/** Unique, sorted union of article paths and the pages each layout type feeds. */
export function saveRevalidationPaths(
  articlePaths: Iterable<string>,
  layoutTypes: Iterable<IndexLayoutType>,
): string[] {
  const paths = new Set(articlePaths);
  for (const type of layoutTypes) {
    paths.add("/substances");
    paths.add(indexLayoutRevalidationPath(type));
  }
  return Array.from(paths).sort((left, right) => left.localeCompare(right));
}
