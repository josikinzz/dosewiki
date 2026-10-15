import { substanceVisibility } from "@/schema/substance/substanceVisibilityPolicy";

export interface SubstanceLookupRow {
  slug: string;
  name: string;
  priority?: string | null;
  indexCategories?: readonly string[] | null;
  psychoactiveClasses?: readonly string[] | null;
}

export interface MoleculePickerItem {
  slug: string;
  title: string;
  hasOverride: boolean;
  publiclyListed?: boolean;
  category?: string;
}

export interface MoleculePickerGroup<Item> {
  key: string;
  heading?: string;
  items: Item[];
}

const UNCATEGORIZED_PICKER_GROUP = "Uncategorized"

function resolvePickerCategory(
  psychoactiveClasses: readonly string[] | null | undefined,
): string | undefined {
  const primary = (psychoactiveClasses ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.length > 0);
  return primary ? primary : undefined;
}

export function compareMoleculePickerItems(
  left: MoleculePickerItem,
  right: MoleculePickerItem,
): number {
  const listedDelta = Number(right.publiclyListed ?? false) - Number(left.publiclyListed ?? false);
  if (listedDelta !== 0) {
    return listedDelta;
  }

  const leftCategory = left.category ?? "";
  const rightCategory = right.category ?? "";
  if (leftCategory !== rightCategory) {
    if (!leftCategory) return 1;
    if (!rightCategory) return -1;
    return leftCategory.localeCompare(rightCategory);
  }

  return left.title.localeCompare(right.title);
}

export function buildSubstancePickerItems(
  rows: readonly SubstanceLookupRow[],
  overrideSlugs: ReadonlySet<string>,
): MoleculePickerItem[] {
  return rows
    .map((row) => ({
      slug: row.slug,
      title: row.name,
      hasOverride: overrideSlugs.has(row.slug),
      publiclyListed:
        substanceVisibility({
          indexCategories: row.indexCategories,
          priority: row.priority,
        }) === "public",
      category: resolvePickerCategory(row.psychoactiveClasses),
    }))
    .sort(compareMoleculePickerItems);
}

export function groupMoleculePickerItems<Item extends MoleculePickerItem>(
  items: readonly Item[],
): MoleculePickerGroup<Item>[] {
  const groups: MoleculePickerGroup<Item>[] = [];

  for (const item of items) {
    const facetless = item.publiclyListed === undefined && item.category === undefined;
    const category = item.category ?? UNCATEGORIZED_PICKER_GROUP;
    const key = facetless ? "" : `${item.publiclyListed === false ? "unlisted" : "listed"}:${category}`;
    const heading = facetless
      ? undefined
      : item.publiclyListed === false
        ? `${category} · not publicly listed`
        : category;

    const previous = groups[groups.length - 1];
    if (previous && previous.key === key) {
      previous.items.push(item);
      continue;
    }

    groups.push({ key, heading, items: [item] });
  }

  return groups;
}
