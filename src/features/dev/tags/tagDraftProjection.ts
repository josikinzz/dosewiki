import { TAG_FIELDS, type TagRegistryInput } from "@/data/tags/tagRegistry";
import { readFieldValues } from "@/data/tags/tagRegistry.shared";
import { slugify } from "@/utils/slug";

export type TagDraft = {
  articles: readonly TagRegistryInput[];
  baseline: readonly TagRegistryInput[];
};

const rowSlug = (row: TagRegistryInput): string => {
  const explicit = "slug" in row && typeof row.slug === "string" ? row.slug.trim() : "";
  return explicit || slugify(row.title || row.identification?.common_name || "");
};

const sameTags = (first: TagRegistryInput, second: TagRegistryInput): boolean =>
  TAG_FIELDS.every((field) => {
    const left = readFieldValues(first, field);
    const right = readFieldValues(second, field);
    return left.length === right.length && left.every((value, index) => value === right[index]);
  });

export function applyDraft<T extends TagRegistryInput>(
  serverTags: readonly T[],
  draft: TagDraft,
): (T | TagRegistryInput)[] {
  const baselineBySlug = new Map(draft.baseline.map((row) => [rowSlug(row), row]));
  const draftSlugs = new Set<string>();
  const changed = new Map<string, TagRegistryInput>();

  draft.articles.forEach((row) => {
    const slug = rowSlug(row);
    draftSlugs.add(slug);
    const before = baselineBySlug.get(slug);
    if (before === row || (before && sameTags(before, row))) {
      return;
    }
    changed.set(slug, row);
  });

  const removed = new Set([...baselineBySlug.keys()].filter((slug) => !draftSlugs.has(slug)));
  if (changed.size === 0 && removed.size === 0) {
    return [...serverTags];
  }

  const projected: (T | TagRegistryInput)[] = [];
  const placed = new Set<string>();
  serverTags.forEach((row) => {
    const slug = rowSlug(row);
    if (removed.has(slug)) {
      return;
    }
    const override = changed.get(slug);
    projected.push(override ?? row);
    if (override) {
      placed.add(slug);
    }
  });
  changed.forEach((row, slug) => {
    if (!placed.has(slug)) {
      projected.push(row);
    }
  });
  return projected;
}

export function baselineTagSignature(baseline: readonly TagRegistryInput[]): string {
  return JSON.stringify(
    baseline.map((row) => [rowSlug(row), ...TAG_FIELDS.map((field) => readFieldValues(row, field))]),
  );
}
