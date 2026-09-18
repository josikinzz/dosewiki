/**
 * Pure state logic for the replication → drug association editor
 * (`/dev` → Replications → one replication → its associated drugs).
 *
 * Associations are automatic exact-drug/class placements or stored direct
 * associations. Unticking one writes a per-article exclusion. Excluding a
 * priority/direct placement also removes its stored position because curation
 * and exclusion cannot overlap.
 */

/** One automatic or stored association row. */
export type ReplicationAssociation = {
  slug: string;
  title: string;
  matchedVia: "specific_drug" | "drug_class" | "visual_disconnection" | "curated";
  effectSlug: string;
  effectName: string;
  /** Already in that substance's stored `removed_slugs` — the saved baseline. */
  excluded: boolean;
  /** 1-based place in that substance's `curated_slugs`, or null when unpinned. */
  curatedPosition: number | null;
};

/** The editable state: which substance slugs this replication is excluded from. */
export type AssociationState = { excluded: string[] };

export function associationStateOf(rows: readonly ReplicationAssociation[]): AssociationState {
  return { excluded: rows.filter((row) => row.excluded).map((row) => row.slug) };
}

/**
 * Compare as a SET, not a sequence. Unlike the gallery's curated head, where
 * order is the stored public ordering, exclusion order carries no meaning —
 * `removed_slugs` is only ever membership-tested — so `['a','b']` equals
 * `['b','a']` and a reordering must not read as an unsaved change.
 */
export function associationStatesEqual(a: AssociationState, b: AssociationState): boolean {
  if (a.excluded.length !== b.excluded.length) {
    return false;
  }
  const other = new Set(b.excluded);
  return a.excluded.every((slug) => other.has(slug));
}

/** Tick or untick one drug. Unticking appends, matching the portal's mutators. */
export function toggleAssociation(state: AssociationState, slug: string): AssociationState {
  if (state.excluded.includes(slug)) {
    return { excluded: state.excluded.filter((entry) => entry !== slug) };
  }
  return { excluded: [...state.excluded, slug] };
}

/**
 * Untick or re-tick every drug in `rows`. Slugs outside `rows` keep whatever
 * they had: `rows` is a filtered view, so a select-all must never silently
 * restore a drug the editor cannot currently see. Returns the same reference
 * when nothing moves, so callers can test unsaved-ness by identity.
 */
export function setAllAssociations(
  state: AssociationState,
  rows: readonly ReplicationAssociation[],
  excluded: boolean,
): AssociationState {
  if (excluded) {
    const present = new Set(state.excluded);
    const added = rows.map((row) => row.slug).filter((slug) => !present.has(slug));
    if (added.length === 0) {
      return state;
    }
    return { excluded: [...state.excluded, ...added] };
  }
  const listed = new Set(rows.map((row) => row.slug));
  const next = state.excluded.filter((slug) => !listed.has(slug));
  if (next.length === state.excluded.length) {
    return state;
  }
  return { excluded: next };
}

/**
 * Counts behind the panel header. Every automatic or direct association is
 * published unless the draft excludes it; a stored position controls ordering,
 * not publication.
 */
export type AssociationSummary = {
  total: number;
  showing: number;
  excluded: number;
  published: number;
  curatedAtRisk: ReplicationAssociation[];
};

/**
 * Count effective publication and rows whose stored position would be removed
 * by a newly added exclusion.
 */
export function summarizeAssociations(
  rows: readonly ReplicationAssociation[],
  state: AssociationState,
): AssociationSummary {
  const excludedSlugs = new Set(state.excluded);
  const curatedAtRisk: ReplicationAssociation[] = [];
  let excluded = 0;
  for (const row of rows) {
    if (!excludedSlugs.has(row.slug)) {
      continue;
    }
    excluded += 1;
    if (row.curatedPosition !== null && !row.excluded) {
      curatedAtRisk.push(row);
    }
  }
  const showing = rows.length - excluded;
  return {
    total: rows.length,
    showing,
    excluded,
    published: showing,
    curatedAtRisk,
  };
}
