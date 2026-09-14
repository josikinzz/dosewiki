/**
 * Ordering and grouping for the molecule editor's substance picker.
 *
 * The picker used to be one flat alphabetical list carrying a single pill that
 * meant "a `moleculeOverrides` row exists" — which reviewers read as "this
 * article is live on the site". Publication is a property of the article, not of
 * the depiction, so the two are split here: a substance's article visibility
 * comes from the shared policy, and the list leads with the publicly listed
 * articles before grouping each tier by psychoactive category.
 *
 * `indexCategories` / `psychoactiveClasses` only reach the client once the
 * extended `projectEditorLookup` is deployed; until then every row simply falls
 * back to the uncategorized group and the priority-only visibility answer.
 */
import { substanceVisibility } from "@/schema/substance/substanceVisibilityPolicy";

/** A row as `substanceIndex.getLookupPage` serves it. */
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
  /** A `moleculeOverrides` row (or class template) exists for this key. */
  hasOverride: boolean;
  /** Article visibility per `substanceVisibility`; unknown for classes and templates. */
  publiclyListed?: boolean;
  /** Primary psychoactive class, used as the grouping key. */
  category?: string;
}

export interface MoleculePickerGroup<Item> {
  key: string;
  heading?: string;
  items: Item[];
}

const UNCATEGORIZED_PICKER_GROUP = "Uncategorized"

/** Articles carry several classes; the first non-empty one drives the grouping. */
function resolvePickerCategory(
  psychoactiveClasses: readonly string[] | null | undefined,
): string | undefined {
  const primary = (psychoactiveClasses ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.length > 0);
  return primary ? primary : undefined;
}

/** Publicly listed articles first, then category (uncategorized last), then title. */
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

/**
 * Fold an already-sorted list into consecutive runs so the combobox can render
 * one `CommandGroup` per (visibility tier, category). Items that carry neither
 * facet — generic class structures and class templates — stay in a single
 * heading-less group, exactly as they rendered before.
 */
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
