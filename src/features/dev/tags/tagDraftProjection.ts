import { TAG_FIELDS, type TagRegistryInput } from "@/utils/data/tagRegistry";
import { readFieldValues } from "@/utils/data/tagRegistry.shared";
import { slugify } from "@/utils/slug";

/**
 * The working set the tag editor layers over the server's tags: the draft
 * rows as they stand now, and the baseline they were loaded as.
 */
export type TagDraft = {
  articles: readonly TagRegistryInput[];
  baseline: readonly TagRegistryInput[];
};

/**
 * The slug a row is known by. Server rows carry the resolved `slug`; draft
 * rows fall back to the title, exactly as `resolveEditorArticleSlug` does, so
 * a draft row always finds the server row it stands for.
 */
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

/**
 * The Tags list: the server's tags with the draft's tag changes on top.
 *
 * A draft row whose tags differ from its baseline replaces the server row of
 * the same slug; an article added in the draft is appended and one removed
 * from it is dropped. Every other server row stands as fetched, including
 * rows the draft never loaded. The list and the mutations read the same
 * projection, so a rename shows before commit and renaming it again finds
 * the articles that carry the new name.
 */
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

/**
 * A fingerprint of the baseline's tags. It changes when a commit moves the
 * baseline to new tags, which is when the server's list must be read again;
 * loading a body into a row leaves it alone.
 */
export function baselineTagSignature(baseline: readonly TagRegistryInput[]): string {
  return JSON.stringify(
    baseline.map((row) => [rowSlug(row), ...TAG_FIELDS.map((field) => readFieldValues(row, field))]),
  );
}
