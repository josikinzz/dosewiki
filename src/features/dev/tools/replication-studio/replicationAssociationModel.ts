export type ReplicationAssociation = {
  slug: string;
  title: string;
  matchedVia: "specific_drug" | "drug_class" | "visual_disconnection" | "curated";
  effectSlug: string;
  effectName: string;
  excluded: boolean;
  curatedPosition: number | null;
};

export type AssociationState = { excluded: string[] };

export function associationStateOf(rows: readonly ReplicationAssociation[]): AssociationState {
  return { excluded: rows.filter((row) => row.excluded).map((row) => row.slug) };
}

export function associationStatesEqual(a: AssociationState, b: AssociationState): boolean {
  if (a.excluded.length !== b.excluded.length) {
    return false;
  }
  const other = new Set(b.excluded);
  return a.excluded.every((slug) => other.has(slug));
}

export function toggleAssociation(state: AssociationState, slug: string): AssociationState {
  if (state.excluded.includes(slug)) {
    return { excluded: state.excluded.filter((entry) => entry !== slug) };
  }
  return { excluded: [...state.excluded, slug] };
}

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

export type AssociationSummary = {
  total: number;
  showing: number;
  excluded: number;
  published: number;
  curatedAtRisk: ReplicationAssociation[];
};

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
