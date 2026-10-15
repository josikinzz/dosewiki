import {
  TAG_FIELDS,
  normalizeTagLabel,
  toTagKey,
  type TagField,
  type TagRegistry,
  type TagUsage,
} from "@/utils/data/tagRegistry";

export const usageKey = (usage: Pick<TagUsage, "field" | "key">): string => `${usage.field}:${usage.key}`;

export const articleWord = (count: number): string => `${count} article${count === 1 ? "" : "s"}`;

export function unionArticleCount(first: TagUsage, second: TagUsage): number {
  const seen = new Set<string>();
  for (const ref of [...first.articleRefs, ...second.articleRefs]) {
    seen.add(ref.slug ?? `index:${ref.index}`);
  }
  return seen.size;
}

export function existingTagFor(
  registry: TagRegistry,
  field: TagField,
  label: string,
  current?: Pick<TagUsage, "key">,
): TagUsage | null {
  const normalized = normalizeTagLabel(label);
  if (!normalized) return null;
  const key = toTagKey(normalized);
  if (current && key === current.key) return null;
  return registry.byKey[field].get(key) ?? null;
}

export type RenameCheck =
  | { kind: "empty" }
  | { kind: "same" }
  | { kind: "case"; label: string }
  | { kind: "merge"; label: string; into: TagUsage; total: number }
  | { kind: "rename"; label: string };

export function checkRename(registry: TagRegistry, usage: TagUsage, value: string): RenameCheck {
  const label = normalizeTagLabel(value);
  if (!label) return { kind: "empty" };
  if (label === normalizeTagLabel(usage.tag)) return { kind: "same" };
  if (toTagKey(label) === usage.key) return { kind: "case", label };
  const into = existingTagFor(registry, usage.field, label, usage);
  if (into) return { kind: "merge", label: into.tag, into, total: unionArticleCount(usage, into) };
  return { kind: "rename", label };
}

function looseKey(label: string): string {
  const letters = toTagKey(label).replace(/[^a-z0-9]+/g, "");
  if (letters.endsWith("ies") && letters.length > 4) return `${letters.slice(0, -3)}y`;
  if (letters.endsWith("es") && /(ses|xes|zes|ches|shes)$/.test(letters)) return letters.slice(0, -2);
  if (letters.endsWith("s") && !letters.endsWith("ss") && letters.length > 3) return letters.slice(0, -1);
  return letters;
}

export function similarTags(registry: TagRegistry, usage: TagUsage): TagUsage[] {
  const key = looseKey(usage.tag);
  if (!key) return [];
  return registry.byField[usage.field]
    .filter((other) => other.key !== usage.key && looseKey(other.tag) === key)
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

export type TagChange = {
  field: TagField;
  key: string;
  tag: string;
  before: number;
  after: number;
  from?: string[];
  kind: "new" | "gone" | "count" | "renamed" | "merged";
};

const refSet = (usage: TagUsage | undefined): Set<string> =>
  new Set(usage ? usage.articleRefs.map((ref) => ref.slug ?? `index:${ref.index}`) : []);

const sameSet = (left: Set<string>, right: Set<string>): boolean =>
  left.size === right.size && [...left].every((value) => right.has(value));

export function tagChanges(server: TagRegistry, projected: TagRegistry): TagChange[] {
  const changes: TagChange[] = [];
  for (const field of TAG_FIELDS) {
    const keys = new Set([...server.byKey[field].keys(), ...projected.byKey[field].keys()]);
    const raw: { key: string; before?: TagUsage; after?: TagUsage }[] = [];
    for (const key of keys) {
      const before = server.byKey[field].get(key);
      const after = projected.byKey[field].get(key);
      if (sameSet(refSet(before), refSet(after)) && before?.tag === after?.tag) continue;
      raw.push({ key, before, after });
    }

    const gone = raw.filter((entry) => entry.before && !entry.after);
    const claimed = new Set<string>();
    const fieldChanges: TagChange[] = [];
    for (const entry of raw) {
      if (!entry.after) continue;
      const afterRefs = refSet(entry.after);
      if (!entry.before) {
        const twin = gone.find((candidate) => !claimed.has(candidate.key) && sameSet(refSet(candidate.before), afterRefs));
        if (twin) {
          claimed.add(twin.key);
          fieldChanges.push({ field, key: entry.key, tag: entry.after.tag, before: 0, after: entry.after.count, from: [twin.before!.tag], kind: "renamed" });
          continue;
        }
        fieldChanges.push({ field, key: entry.key, tag: entry.after.tag, before: 0, after: entry.after.count, kind: "new" });
        continue;
      }
      const folded = gone.filter((candidate) => !claimed.has(candidate.key) && [...refSet(candidate.before)].every((ref) => afterRefs.has(ref)));
      if (entry.after.count > entry.before.count && folded.length > 0) {
        folded.forEach((candidate) => claimed.add(candidate.key));
        fieldChanges.push({
          field, key: entry.key, tag: entry.after.tag, before: entry.before.count, after: entry.after.count,
          from: folded.map((candidate) => candidate.before!.tag), kind: "merged",
        });
        continue;
      }
      fieldChanges.push({ field, key: entry.key, tag: entry.after.tag, before: entry.before.count, after: entry.after.count, kind: "count" });
    }
    for (const entry of gone) {
      if (claimed.has(entry.key)) continue;
      fieldChanges.push({ field, key: entry.key, tag: entry.before!.tag, before: entry.before!.count, after: 0, kind: "gone" });
    }
    fieldChanges.sort((left, right) => left.tag.localeCompare(right.tag));
    changes.push(...fieldChanges);
  }
  return changes;
}

export function describeTagChange(change: TagChange): string {
  const from = (change.from ?? []).map((label) => `“${label}”`).join(", ");
  switch (change.kind) {
    case "renamed":
      return `renamed from ${from}, on ${articleWord(change.after)}`;
    case "merged":
      return `${from} merged in, now on ${articleWord(change.after)}, was ${change.before}`;
    case "new":
      return `new, on ${articleWord(change.after)}`;
    case "gone":
      return `removed, was on ${articleWord(change.before)}`;
    case "count":
      return change.before === change.after
        ? `on ${articleWord(change.after)}, relabelled`
        : `on ${articleWord(change.after)}, was ${change.before}`;
  }
}

export function matchesInOtherFields(registry: TagRegistry, field: TagField, query: string): { field: TagField; count: number }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return TAG_FIELDS.filter((other) => other !== field)
    .map((other) => ({ field: other, count: registry.byField[other].filter((usage) => usage.tag.toLowerCase().includes(needle)).length }))
    .filter((entry) => entry.count > 0);
}
