export function sectionConventionRank(name: string | undefined): number {
  const n = (name ?? "").trim().toLowerCase();
  if (n === "common" || n === "general") return 0;
  if (n.startsWith("other")) return 2;
  return 1;
}

export function orderIndexSections<T extends { name?: string }>(sections: readonly T[]): T[] {
  return sections
    .slice()
    .sort((a, b) => sectionConventionRank(a.name) - sectionConventionRank(b.name));
}
