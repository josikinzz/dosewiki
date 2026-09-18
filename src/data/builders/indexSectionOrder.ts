/**
 * Canonical section ordering for index panels: a "Common" (or "General")
 * bucket first, then the named subclasses, then any "Other …" catch-all last.
 * `Array.prototype.sort` is stable, so sections passed in their authored
 * (JSON) order keep that order within each rank.
 *
 * Shared by the public Substance Index and the /dev Index layout editor so the
 * editor's board is the page the reader gets.
 */
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
