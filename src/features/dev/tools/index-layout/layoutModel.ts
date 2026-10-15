import { slugify } from "@/utils/slug";
import type { BoardCategory } from "./boardModel";
import type { LayoutSlot } from "./layoutOps";
import type { ManualCategoryDefinition, ManualDatasetKey, ManualIndexConfig } from "./types";

export const DATASET_ORDER: readonly ManualDatasetKey[] = ["psychoactive", "chemical", "mechanism"];

export const DATASET_LABELS: Record<ManualDatasetKey, string> = {
  psychoactive: "Psychoactive class",
  chemical: "Chemical class",
  mechanism: "Mechanism of action",
};

export const DATASET_SHORT_LABELS: Record<ManualDatasetKey, string> = {
  psychoactive: "Psychoactive",
  chemical: "Chemical",
  mechanism: "Mechanism",
};

export function countNoun(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function normalizeManual(manual: ManualIndexConfig): ManualIndexConfig {
  const categories = Array.isArray(manual.categories) ? manual.categories : [];
  let changed = categories !== manual.categories;
  const next = categories.map((category) => {
    const drugs = Array.isArray(category.drugs) ? category.drugs : [];
    const sections = Array.isArray(category.sections) ? category.sections : [];
    let sectionsChanged = false;
    const safeSections = sections.map((section) => {
      if (Array.isArray(section.drugs)) return section;
      sectionsChanged = true;
      return { ...section, drugs: [] };
    });
    if (drugs === category.drugs && sections === category.sections && !sectionsChanged) return category;
    changed = true;
    return { ...category, drugs, sections: safeSections } satisfies ManualCategoryDefinition;
  });
  return changed ? { ...manual, categories: next } : manual;
}

export function slotName(board: readonly BoardCategory[], slot: LayoutSlot): string {
  const category = board.find((entry) => entry.key === slot.categoryKey);
  if (!category) return slot.categoryKey;
  if (slot.sectionKey === null) return category.label;
  const section = category.sections.find((entry) => entry.slot.sectionKey === slot.sectionKey);
  return section?.label ? `${category.label}, ${section.label}` : category.label;
}

type SlotRef = { key: string; label: string; categoryKey: string; sectionKey: string | null };

function slotsOf(manual: ManualIndexConfig): { slots: SlotRef[]; bySlug: Map<string, SlotRef[]>; lists: Map<string, string[]> } {
  const slots: SlotRef[] = [];
  const bySlug = new Map<string, SlotRef[]>();
  const lists = new Map<string, string[]>();
  const add = (ref: SlotRef, drugs: readonly string[]) => {
    slots.push(ref);
    const slugs = drugs.map((slug) => slugify(slug) || slug);
    lists.set(ref.key, slugs);
    for (const slug of slugs) {
      const refs = bySlug.get(slug) ?? [];
      refs.push(ref);
      bySlug.set(slug, refs);
    }
  };
  for (const category of normalizeManual(manual).categories) {
    add({ key: `${category.key}::`, label: category.label, categoryKey: category.key, sectionKey: null }, category.drugs);
    for (const section of category.sections) {
      add(
        { key: `${category.key}::${section.key}`, label: `${category.label}, ${section.label}`, categoryKey: category.key, sectionKey: section.key },
        section.drugs,
      );
    }
  }
  return { slots, bySlug, lists };
}

export type LayoutChange = { key: string; text: string; kind: "category" | "section" | "substance" | "order" };

export function describeLayoutChanges(
  original: ManualIndexConfig,
  draft: ManualIndexConfig,
  nameOf: (slug: string) => string,
): LayoutChange[] {
  const before = normalizeManual(original);
  const after = normalizeManual(draft);
  const changes: LayoutChange[] = [];
  const beforeCategories = new Map(before.categories.map((category) => [category.key, category]));
  const afterCategories = new Map(after.categories.map((category) => [category.key, category]));

  for (const category of after.categories) {
    const previous = beforeCategories.get(category.key);
    if (!previous) {
      changes.push({ key: `category-added:${category.key}`, kind: "category", text: `Added the ${category.label} category` });
      continue;
    }
    if (previous.label !== category.label) {
      changes.push({ key: `category-renamed:${category.key}`, kind: "category", text: `Renamed ${previous.label} to ${category.label}` });
    }
    if (previous.iconKey !== category.iconKey) {
      changes.push({ key: `category-icon:${category.key}`, kind: "category", text: `Changed the ${category.label} icon` });
    }
    const beforeSections = new Map(previous.sections.map((section) => [section.key, section]));
    const afterSections = new Map(category.sections.map((section) => [section.key, section]));
    for (const section of category.sections) {
      const was = beforeSections.get(section.key);
      if (!was) {
        changes.push({ key: `section-added:${category.key}:${section.key}`, kind: "section", text: `Added the ${section.label} section to ${category.label}` });
      } else if (was.label !== section.label) {
        changes.push({ key: `section-renamed:${category.key}:${section.key}`, kind: "section", text: `Renamed ${was.label} to ${section.label} in ${category.label}` });
      }
    }
    for (const section of previous.sections) {
      if (!afterSections.has(section.key)) {
        changes.push({ key: `section-removed:${category.key}:${section.key}`, kind: "section", text: `Removed the ${section.label} section from ${category.label}` });
      }
    }
    const keptBefore = previous.sections.map((section) => section.key).filter((key) => afterSections.has(key));
    const keptAfter = category.sections.map((section) => section.key).filter((key) => beforeSections.has(key));
    if (keptBefore.join("\n") !== keptAfter.join("\n")) {
      changes.push({ key: `section-order:${category.key}`, kind: "order", text: `Reordered the sections in ${category.label}` });
    }
  }
  for (const category of before.categories) {
    if (!afterCategories.has(category.key)) {
      changes.push({ key: `category-removed:${category.key}`, kind: "category", text: `Removed the ${category.label} category` });
    }
  }

  const beforeSlots = slotsOf(before);
  const afterSlots = slotsOf(after);
  const slugs = new Set([...beforeSlots.bySlug.keys(), ...afterSlots.bySlug.keys()]);
  const substanceLines: LayoutChange[] = [];
  for (const slug of slugs) {
    const was = (beforeSlots.bySlug.get(slug) ?? []).filter((ref) => afterCategories.has(ref.categoryKey));
    const now = afterSlots.bySlug.get(slug) ?? [];
    const wasKeys = new Set(was.map((ref) => ref.key));
    const nowKeys = new Set(now.map((ref) => ref.key));
    const left = was.filter((ref) => !nowKeys.has(ref.key));
    const joined = now.filter((ref) => !wasKeys.has(ref.key));
    if (left.length === 0 && joined.length === 0) continue;
    const name = nameOf(slug);
    if (left.length === 1 && joined.length === 1) {
      substanceLines.push({ key: `moved:${slug}`, kind: "substance", text: `Moved ${name} from ${left[0].label} to ${joined[0].label}` });
      continue;
    }
    if (joined.length > 0) {
      const into = joinWords(joined.map((ref) => ref.label));
      substanceLines.push({
        key: `added:${slug}`,
        kind: "substance",
        text: was.length === 0 && (beforeSlots.bySlug.get(slug) ?? []).length === 0 ? `Placed ${name} in ${into}` : `Added ${name} to ${into}`,
      });
    }
    if (left.length > 0) {
      const from = joinWords(left.map((ref) => ref.label));
      substanceLines.push({
        key: `removed:${slug}`,
        kind: "substance",
        text: now.length === 0 ? `Took ${name} out of the index (was in ${from})` : `Removed ${name} from ${from}`,
      });
    }
  }
  substanceLines.sort((first, second) => first.text.localeCompare(second.text));
  changes.push(...substanceLines);

  for (const slot of afterSlots.slots) {
    const previous = beforeSlots.lists.get(slot.key);
    const current = afterSlots.lists.get(slot.key);
    if (!previous || !current) continue;
    const shared = new Set(previous.filter((slug) => current.includes(slug)));
    const orderBefore = previous.filter((slug) => shared.has(slug)).join("\n");
    const orderAfter = current.filter((slug) => shared.has(slug)).join("\n");
    if (orderBefore !== orderAfter) {
      changes.push({ key: `order:${slot.key}`, kind: "order", text: `Reordered ${slot.label}` });
    }
  }

  return changes;
}

export function isLayoutConflictMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /code=EDIT_CONFLICT|changed since you opened/i.test(message);
}
