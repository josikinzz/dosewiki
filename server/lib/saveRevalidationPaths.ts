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
