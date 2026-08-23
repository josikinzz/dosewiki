/**
 * Pure state logic for the replication → drug association editor
 * (`/dev` → Replications → one replication → its associated drugs).
 *
 * An association can be derived from visual effects/title or stored directly
 * in a substance gallery. Direct curation establishes the association and
 * moving it to `removed_slugs` retains it as an exclusion; neither form mutates
 * effect tags. Unticking a drug touches only that drug, and excluding a direct
 * placement also removes its curated position because curation and exclusion
 * cannot overlap.
 */

/**
 * One association row: derived by effects/title or retained by stored direct
 * curation/exclusion.
 */
export type ReplicationAssociation = {
  slug: string;
  title: string;
  matchedVia: "effect_slug" | "effect_tags" | "title" | "curated";
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
 * Counts behind the panel's header. Two of them are deliberately different
 * numbers: under the publish gate a drug shows this replication only once it is
 * curated on that drug's board, so *eligible* (`showing`) means the article MAY
 * show it, while *published* means it does.
 */
export type AssociationSummary = {
  /** Matched drug articles — every row in this editor. */
  total: number;
  /**
   * Rows this draft does NOT exclude: eligible, not published. An eligible drug
   * is allowed to show this replication; it only does once curated there.
   */
  showing: number;
  excluded: number;
  /** Rows actually published: curated on that drug AND not excluded here. */
  published: number;
  curatedAtRisk: ReplicationAssociation[];
};

/**
 * Counts behind "N showing · M eligible · K excluded", plus the rows that need
 * an inline warning: dropping a drug that pinned this replication is allowed,
 * but it also un-curates it, so it can never be silent. Rows excluded on the
 * server already are the saved state rather than a new loss, so only rows this
 * draft newly excludes count as at risk.
 */
export function summarizeAssociations(
  rows: readonly ReplicationAssociation[],
  state: AssociationState,
): AssociationSummary {
  const excludedSlugs = new Set(state.excluded);
  const curatedAtRisk: ReplicationAssociation[] = [];
  let excluded = 0;
  let published = 0;
  for (const row of rows) {
    if (!excludedSlugs.has(row.slug)) {
      if (row.curatedPosition !== null) {
        published += 1;
      }
      continue;
    }
    excluded += 1;
    if (row.curatedPosition !== null && !row.excluded) {
      curatedAtRisk.push(row);
    }
  }
  return {
    total: rows.length,
    showing: rows.length - excluded,
    excluded,
    published,
    curatedAtRisk,
  };
}
