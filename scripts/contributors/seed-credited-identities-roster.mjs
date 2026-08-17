// Pure contributor-roster impact preview.
import { matchNamesOf } from "./seed-credited-identities-plan.mjs";
import { normalizeKey, normalizeName } from "./seed-credited-identities-policy.mjs";

/* ------------------------------------------------------------------- roster preview */

/** Mirrors `EFFECT_INDEX_FOUNDER_KEY` in src/data/contributorRoster.ts. */
export const ROSTER_FOUNDER_KEY = "JOSIE";

/** Mirrors `EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS`. */
export const ROSTER_EXCLUDED_KEYS = Object.freeze(["LYREA"]);

/**
 * Count the distinct pages that credit each profile.
 *
 * A deliberate re-implementation of `countContributorPageReferences` from
 * `src/data/contributorRoster.ts`, because this script is ESM JavaScript and
 * that module is TypeScript inside the app graph. It is a preview, not a write
 * input: if the two ever drift, the ordering shown here is wrong and nothing
 * stored is. The rule it mirrors — one page counts once for a contributor,
 * however many times that page names them — is stated in that module's header.
 */
export function countPageReferences(profiles, { effects = [], replications = [], reports = [] } = {}) {
  const pages = new Map();
  const add = (id, name) => {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!pages.has(id)) {
      pages.set(id, new Set());
    }
    if (trimmed) {
      pages.get(id).add(trimmed);
    }
  };

  for (const effect of effects) {
    const id = `effect:${effect.slug}`;
    add(id, "");
    for (const contributor of effect.contributors ?? []) {
      add(id, contributor);
    }
    for (const audio of effect.audio_replications ?? []) {
      add(id, audio?.artist);
    }
  }

  for (const replication of replications) {
    add(`effect:${replication.effect_slug}`, replication.artist);
  }

  for (const report of reports) {
    add(`report:${report.slug}`, report?.subject?.name);
  }

  const byName = new Map();
  for (const profile of profiles) {
    for (const name of matchNamesOf(profile)) {
      byName.set(name, normalizeKey(profile.key));
    }
  }

  const counts = new Map(profiles.map((profile) => [normalizeKey(profile.key), 0]));
  for (const names of pages.values()) {
    const credited = new Set();
    for (const name of names) {
      const key = byName.get(normalizeName(name));
      if (key) {
        credited.add(key);
      }
    }
    for (const key of credited) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

/** The roster as the About page would render it: founder pinned, then by count. */
export function buildRosterPreview(profiles, counts) {
  const excluded = new Set(ROSTER_EXCLUDED_KEYS.map(normalizeKey));
  const entries = profiles
    .map((profile) => ({
      key: normalizeKey(profile.key),
      displayName: profile.displayName,
      referenceCount: counts.get(normalizeKey(profile.key)) ?? 0,
    }))
    .filter((entry) => !excluded.has(entry.key));

  const founder = entries.find((entry) => entry.key === ROSTER_FOUNDER_KEY) ?? null;
  const rest = entries
    .filter((entry) => entry !== founder)
    .sort(
      (left, right) =>
        right.referenceCount - left.referenceCount ||
        left.displayName.localeCompare(right.displayName) ||
        left.key.localeCompare(right.key),
    );

  return founder ? [founder, ...rest] : rest;
}

/**
 * What the published contributor roster becomes.
 *
 * This is the part of the run that most needs a human's eye: the import does not
 * quietly add pages, it adds names to a page the site presents as "everyone who
 * has contributed to the archive". So the plan states the before, the after, and
 * every name that is new — in roster order, so the owner can see where each one
 * lands.
 */
export function previewRosterImpact({ profiles = [], plan, effects = [], replications = [], reports = [] }) {
  const aliasesByKey = new Map(
    plan.aliasAdditions.map((addition) => [addition.key, addition.aliases]),
  );

  const beforeProfiles = profiles.map((profile) => ({
    key: normalizeKey(profile.key),
    displayName: profile.displayName,
    aliases: profile.aliases ?? [],
  }));

  const afterProfiles = [
    ...beforeProfiles.map((profile) => ({
      ...profile,
      aliases: Array.from(new Set([...profile.aliases, ...(aliasesByKey.get(profile.key) ?? [])])),
    })),
    ...plan.created.map((row) => ({
      key: row.key,
      displayName: row.displayName,
      aliases: row.aliases,
    })),
  ];

  const source = { effects, replications, reports };
  const before = buildRosterPreview(beforeProfiles, countPageReferences(beforeProfiles, source));
  const after = buildRosterPreview(afterProfiles, countPageReferences(afterProfiles, source));

  const beforeKeys = new Set(before.map((entry) => entry.key));
  const notable = new Set(
    plan.created.filter((row) => row.notableThirdParty).map((row) => row.key),
  );

  return {
    before,
    after,
    added: after
      .map((entry, index) => ({ ...entry, position: index + 1, notableThirdParty: notable.has(entry.key) }))
      .filter((entry) => !beforeKeys.has(entry.key)),
    movedByAlias: after
      .filter((entry) => beforeKeys.has(entry.key))
      .map((entry) => ({
        ...entry,
        wasReferenceCount: before.find((row) => row.key === entry.key)?.referenceCount ?? 0,
      }))
      .filter((entry) => entry.referenceCount !== entry.wasReferenceCount),
  };
}
