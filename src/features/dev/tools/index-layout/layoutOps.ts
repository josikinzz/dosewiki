import { slugify } from "@/utils/slug";
import type { ManualCategoryDefinition, ManualCategorySection, ManualIndexConfig } from "./types";
import { generateUniqueKey } from "./utils";

export type LayoutSlot = { categoryKey: string; sectionKey: string | null };

export type MoveDirection = "up" | "down";

export function slotId(slot: LayoutSlot): string {
  return `${slot.categoryKey}::${slot.sectionKey ?? ""}`;
}

export function slotsEqual(left: LayoutSlot, right: LayoutSlot): boolean {
  return left.categoryKey === right.categoryKey && left.sectionKey === right.sectionKey;
}

function readSlot(manual: ManualIndexConfig, slot: LayoutSlot): readonly string[] | null {
  const category = manual.categories.find((entry) => entry.key === slot.categoryKey);
  if (!category) return null;
  if (slot.sectionKey === null) return category.drugs;
  return category.sections.find((section) => section.key === slot.sectionKey)?.drugs ?? null;
}

function writeSlot(
  manual: ManualIndexConfig,
  slot: LayoutSlot,
  drugs: readonly string[],
): ManualIndexConfig {
  return {
    ...manual,
    categories: manual.categories.map((category) => {
      if (category.key !== slot.categoryKey) return category;
      if (slot.sectionKey === null) return { ...category, drugs: [...drugs] };
      return {
        ...category,
        sections: category.sections.map((section) =>
          section.key === slot.sectionKey ? { ...section, drugs: [...drugs] } : section,
        ),
      };
    }),
  };
}

function moveWithin<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function bumpSlug(
  manual: ManualIndexConfig,
  slot: LayoutSlot,
  slug: string,
  direction: MoveDirection,
): ManualIndexConfig {
  const drugs = readSlot(manual, slot);
  if (!drugs) return manual;
  const index = drugs.indexOf(slug);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= drugs.length) return manual;
  return writeSlot(manual, slot, moveWithin(drugs, index, target));
}

export function moveSlug(
  manual: ManualIndexConfig,
  from: LayoutSlot,
  slug: string,
  to: LayoutSlot,
  index?: number,
): ManualIndexConfig {
  const source = readSlot(manual, from);
  if (!source) return manual;
  const sourceIndex = source.indexOf(slug);
  if (sourceIndex < 0) return manual;

  if (slotsEqual(from, to)) {
    const target = Math.min(index ?? source.length - 1, source.length - 1);
    if (target === sourceIndex) return manual;
    return writeSlot(manual, from, moveWithin(source, sourceIndex, target));
  }

  const destination = readSlot(manual, to);
  if (!destination) return manual;
  const removed = writeSlot(manual, from, source.filter((entry) => entry !== slug));
  if (destination.includes(slug)) return removed;
  const nextDestination = [...destination];
  nextDestination.splice(Math.min(index ?? destination.length, destination.length), 0, slug);
  return writeSlot(removed, to, nextDestination);
}

export function removeSlug(manual: ManualIndexConfig, slot: LayoutSlot, slug: string): ManualIndexConfig {
  const drugs = readSlot(manual, slot);
  if (!drugs || !drugs.includes(slug)) return manual;
  return writeSlot(manual, slot, drugs.filter((entry) => entry !== slug));
}

export function addSlug(manual: ManualIndexConfig, slot: LayoutSlot, slug: string): ManualIndexConfig {
  const normalized = slugify(slug);
  const drugs = readSlot(manual, slot);
  if (!normalized || !drugs || drugs.includes(normalized)) return manual;
  return writeSlot(manual, slot, [...drugs, normalized]);
}

export function sortSlot(
  manual: ManualIndexConfig,
  slot: LayoutSlot,
  sort: (slugs: readonly string[]) => string[],
): ManualIndexConfig {
  const drugs = readSlot(manual, slot);
  if (!drugs) return manual;
  const sorted = sort(drugs);
  if (sorted.every((slug, index) => slug === drugs[index])) return manual;
  return writeSlot(manual, slot, sorted);
}

function updateCategory(
  manual: ManualIndexConfig,
  categoryKey: string,
  update: (category: ManualCategoryDefinition) => ManualCategoryDefinition,
): ManualIndexConfig {
  let changed = false;
  const categories = manual.categories.map((category) => {
    if (category.key !== categoryKey) return category;
    const next = update(category);
    if (next !== category) changed = true;
    return next;
  });
  return changed ? { ...manual, categories } : manual;
}

export function sortCategory(
  manual: ManualIndexConfig,
  categoryKey: string,
  sort: (slugs: readonly string[]) => string[],
): ManualIndexConfig {
  return updateCategory(manual, categoryKey, (category) => {
    const drugs = sort(category.drugs);
    const sections = category.sections.map((section) => {
      const sorted = sort(section.drugs);
      return sorted.every((slug, index) => slug === section.drugs[index]) ? section : { ...section, drugs: sorted };
    });
    const drugsChanged = !drugs.every((slug, index) => slug === category.drugs[index]);
    const sectionsChanged = sections.some((section, index) => section !== category.sections[index]);
    if (!drugsChanged && !sectionsChanged) return category;
    return { ...category, drugs: drugsChanged ? drugs : category.drugs, sections };
  });
}

export function placeSection(
  manual: ManualIndexConfig,
  categoryKey: string,
  sectionKey: string,
  targetSectionKey: string,
  placement: "before" | "after",
): ManualIndexConfig {
  return updateCategory(manual, categoryKey, (category) => {
    const index = category.sections.findIndex((section) => section.key === sectionKey);
    if (index < 0 || sectionKey === targetSectionKey) return category;
    const rest = category.sections.filter((section) => section.key !== sectionKey);
    const targetIndex = rest.findIndex((section) => section.key === targetSectionKey);
    if (targetIndex < 0) return category;
    const sections = [...rest];
    sections.splice(placement === "before" ? targetIndex : targetIndex + 1, 0, category.sections[index]);
    if (sections.every((section, position) => section === category.sections[position])) return category;
    return { ...category, sections };
  });
}

export function renameSection(
  manual: ManualIndexConfig,
  categoryKey: string,
  sectionKey: string,
  label: string,
): ManualIndexConfig {
  const trimmed = label.trim();
  if (!trimmed) return manual;
  return updateCategory(manual, categoryKey, (category) => ({
    ...category,
    sections: category.sections.map((section) =>
      section.key === sectionKey && section.label !== trimmed ? { ...section, label: trimmed } : section,
    ),
  }));
}

export function addSection(
  manual: ManualIndexConfig,
  categoryKey: string,
  label: string,
): { manual: ManualIndexConfig; sectionKey: string | null } {
  const trimmed = label.trim();
  if (!trimmed) return { manual, sectionKey: null };
  let sectionKey: string | null = null;
  const next = updateCategory(manual, categoryKey, (category) => {
    sectionKey = generateUniqueKey(trimmed, new Set(category.sections.map((section) => section.key)));
    const section: ManualCategorySection = { key: sectionKey, label: trimmed, drugs: [] };
    return { ...category, sections: [...category.sections, section] };
  });
  return { manual: next, sectionKey };
}

export function removeSection(
  manual: ManualIndexConfig,
  categoryKey: string,
  sectionKey: string,
  keepDrugs: boolean,
): ManualIndexConfig {
  return updateCategory(manual, categoryKey, (category) => {
    const section = category.sections.find((entry) => entry.key === sectionKey);
    if (!section) return category;
    const sections = category.sections.filter((entry) => entry.key !== sectionKey);
    const drugs = keepDrugs
      ? [...category.drugs, ...section.drugs.filter((slug) => !category.drugs.includes(slug))]
      : category.drugs;
    return { ...category, sections, drugs };
  });
}

export function addCategory(
  manual: ManualIndexConfig,
  label: string,
  iconKey: string,
): { manual: ManualIndexConfig; categoryKey: string | null } {
  const trimmed = label.trim();
  if (!trimmed) return { manual, categoryKey: null };
  const categoryKey = generateUniqueKey(trimmed, new Set(manual.categories.map((category) => category.key)));
  const category: ManualCategoryDefinition = {
    key: categoryKey,
    label: trimmed,
    iconKey: iconKey.trim() || categoryKey,
    drugs: [],
    sections: [],
  };
  return { manual: { ...manual, categories: [...manual.categories, category] }, categoryKey };
}

export function updateCategoryIdentity(
  manual: ManualIndexConfig,
  categoryKey: string,
  patch: { label?: string; iconKey?: string },
): ManualIndexConfig {
  return updateCategory(manual, categoryKey, (category) => {
    const label = patch.label?.trim() || category.label;
    const iconKey = patch.iconKey?.trim() || category.iconKey;
    if (label === category.label && iconKey === category.iconKey) return category;
    return { ...category, label, iconKey };
  });
}

export function removeCategory(manual: ManualIndexConfig, categoryKey: string): ManualIndexConfig {
  if (!manual.categories.some((category) => category.key === categoryKey)) return manual;
  return { ...manual, categories: manual.categories.filter((category) => category.key !== categoryKey) };
}

export function collectPlacedSlugs(manual: ManualIndexConfig): ReadonlySet<string> {
  const placed = new Set<string>();
  for (const category of manual.categories) {
    for (const slug of category.drugs) placed.add(slugify(slug));
    for (const section of category.sections) {
      for (const slug of section.drugs) placed.add(slugify(slug));
    }
  }
  return placed;
}

