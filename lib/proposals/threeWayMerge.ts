/**
 * Reconciling a local draft with a record someone else changed meanwhile.
 *
 * Three versions meet here: the original baseline the draft was edited from,
 * the local draft ("mine"), and the latest record ("theirs"). A field only one
 * side changed carries forward into the proposed draft on its own. A field
 * both sides changed to different values is a conflict: the proposal holds the
 * latest record's value until a person chooses a side, and nothing is final
 * while any conflict is unresolved.
 *
 * The walk reads a document the way the article patch does, so a conflict's
 * path is the same path Change Review shows (`dosage.routes[oral].notes`,
 * `references[doi-1]`, `legality.countries.US`): records by key, keyed arrays
 * by their domain identity, never by position, and ranges as one value. A list
 * of plain names (interaction partners, tags) merges as a set.
 *
 * Choosing is not publishing. The merged draft still goes through the tool's
 * own write with the latest revision check, which refuses any further change
 * that lands after this merge.
 */

import { fieldChangesAt, isRangeValue, type ArticleFieldChange } from "./articlePatch";

export type MergeSide = "mine" | "theirs";

/** One field both sides changed to different values. `undefined` means removed or absent. */
export type MergeConflict = { path: string; base: unknown; mine: unknown; theirs: unknown };

/** The side chosen for each conflict, by its path. */
export type MergeChoices = Readonly<Record<string, MergeSide>>;

export type ThreeWayMerge<T> = {
  /** The proposed draft. An unresolved conflict holds the latest record's value. */
  merged: T;
  conflicts: MergeConflict[];
  /** Conflict paths still waiting on a choice; the merge is final only when empty. */
  unresolved: string[];
  /** Changes only the local draft made, carried forward. */
  mine: ArticleFieldChange[];
  /** Changes only the latest record made, carried forward. */
  theirs: ArticleFieldChange[];
};

export type MergeOptions = {
  choices?: MergeChoices;
  /** The field naming each entry of the keyed array at `path`, or null for none. */
  identity?: (path: string) => string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Structural equality that ignores key order, so a re-serialized record is not a change. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) if (!sameValue(a[key], b[key])) return false;
    return true;
  }
  return false;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => isRecord(value) && !isRangeValue(value);

/** A list of distinct names or numbers, which merges as a set. */
function isNameSet(value: unknown): value is Array<string | number> {
  return Array.isArray(value)
    && value.every((item) => typeof item === "string" || typeof item === "number")
    && new Set(value).size === value.length;
}

/** The entries of a keyed array by identity, or null when any entry lacks a distinct one. */
function keyedEntries(value: unknown, key: string): Map<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  const entries = new Map<string, unknown>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const identity = item[key];
    if (typeof identity !== "string" && typeof identity !== "number") return null;
    if (entries.has(String(identity))) return null;
    entries.set(String(identity), item);
  }
  return entries;
}

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * Lays the other side's new entries into a chosen order: each goes before the
 * entry that followed it on its own side, or at the end when none did.
 */
function weaveOrder(skeleton: string[], other: string[]): string[] {
  const order = [...skeleton];
  for (let index = other.length - 1; index >= 0; index -= 1) {
    const id = other[index];
    if (order.includes(id)) continue;
    const next = other.slice(index + 1).find((candidate) => order.includes(candidate));
    order.splice(next === undefined ? order.length : order.indexOf(next), 0, id);
  }
  return order;
}

export function mergeThreeWay<T = unknown>(base: unknown, mine: unknown, theirs: unknown, options: MergeOptions = {}): ThreeWayMerge<T> {
  const choices = options.choices ?? {};
  const identity = options.identity ?? (() => null);
  const conflicts: MergeConflict[] = [];
  const mineChanges: ArticleFieldChange[] = [];
  const theirChanges: ArticleFieldChange[] = [];

  const conflict = (path: string, b: unknown, m: unknown, t: unknown) => {
    conflicts.push({ path, base: b, mine: m, theirs: t });
    return choices[path] === "mine" ? m : t;
  };

  const walk = (b: unknown, m: unknown, t: unknown, path: string): unknown => {
    if (sameValue(m, t)) return m;
    if (sameValue(b, m)) { theirChanges.push(...fieldChangesAt(b, t, path, identity)); return t; }
    if (sameValue(b, t)) { mineChanges.push(...fieldChangesAt(b, m, path, identity)); return m; }

    if (isPlainRecord(b) && isPlainRecord(m) && isPlainRecord(t)) {
      const result: Record<string, unknown> = {};
      const keys = [...Object.keys(t), ...Object.keys(m).filter((key) => !(key in t)), ...Object.keys(b).filter((key) => !(key in t) && !(key in m))];
      for (const key of keys) {
        const value = walk(b[key], m[key], t[key], path ? `${path}.${key}` : key);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }

    const key = path ? identity(path) : null;
    const keyed = key ? [keyedEntries(b, key), keyedEntries(m, key), keyedEntries(t, key)] : null;
    if (keyed && keyed[0] && keyed[1] && keyed[2]) {
      const [before, local, latest] = keyed as [Map<string, unknown>, Map<string, unknown>, Map<string, unknown>];
      const values = new Map<string, unknown>();
      for (const id of new Set([...latest.keys(), ...local.keys(), ...before.keys()])) {
        values.set(id, walk(before.get(id), local.get(id), latest.get(id), `${path}[${id}]`));
      }
      // Order is its own field: only entries every side still holds can say
      // whether someone moved them.
      const shared = (ids: Iterable<string>) => [...ids].filter((id) => before.has(id) && local.has(id) && latest.has(id));
      const baseOrder = shared(before.keys()), mineOrder = shared(local.keys()), theirOrder = shared(latest.keys());
      const orderPath = `${path} order`;
      let skeleton: string[];
      const mineMoved = !sameOrder(mineOrder, baseOrder), theirsMoved = !sameOrder(theirOrder, baseOrder);
      if (mineMoved && theirsMoved && !sameOrder(mineOrder, theirOrder)) {
        skeleton = conflict(orderPath, [...before.keys()], [...local.keys()], [...latest.keys()]) as string[];
      } else if (mineMoved) {
        mineChanges.push({ path: orderPath, before: [...before.keys()], after: [...local.keys()] });
        skeleton = [...local.keys()];
      } else {
        if (theirsMoved) theirChanges.push({ path: orderPath, before: [...before.keys()], after: [...latest.keys()] });
        skeleton = [...latest.keys()];
      }
      return weaveOrder(weaveOrder(skeleton, [...local.keys()]), [...latest.keys()])
        .filter((id) => values.get(id) !== undefined)
        .map((id) => values.get(id));
    }

    if (isNameSet(b) && isNameSet(m) && isNameSet(t)) {
      mineChanges.push({ path, before: b, after: m });
      theirChanges.push({ path, before: b, after: t });
      const removedByMe = new Set(b.filter((item) => !m.includes(item)));
      const removedByThem = new Set(b.filter((item) => !t.includes(item)));
      const kept = t.filter((item) => !removedByMe.has(item));
      return [...kept, ...m.filter((item) => !kept.includes(item) && !removedByThem.has(item))];
    }

    return conflict(path, b, m, t);
  };

  const merged = walk(base, mine, theirs, "") as T;
  return {
    merged,
    conflicts,
    unresolved: conflicts.filter((entry) => choices[entry.path] === undefined).map((entry) => entry.path),
    mine: mineChanges,
    theirs: theirChanges,
  };
}
