import { contentHash, stableStringify } from "../../../lib/proposals/contentHash";
import type { SubstanceArticleRecord } from "./substanceProjectionCore";
import {
  projectLibraryInput,
  projectEditorLookup,
  projectLookup,
  projectMechanismRouteInput,
  projectPublicPreview,
  projectSearchInput,
} from "./substanceReadProjections";


const DETAIL_ONLY_FIELDS = new Set([
  "comparisons",
  "harm_potential",
  "history_culture",
  "legality",
]);
const STORAGE_IDENTITY_FIELDS = new Set(["_id", "_creationTime", "publicRevision"]);
export type SubstancePublicationDependency = "detail" | "content" | "membership";

function projectionHash(value: unknown): string {
  return contentHash(value);
}

/**
 * Classify a committed article diff by the public projections it can change.
 * Creation/deletion and lookup changes are membership changes. A change to any
 * collection payload is content-bearing. Everything else is detail-only.
 */
export function classifySubstancePublicationDependency(
  before: SubstanceArticleRecord | null,
  after: SubstanceArticleRecord | null,
): SubstancePublicationDependency {
  if (!before || !after) return "membership";
  const beforeMembership = {
    lookup: projectLookup(before),
    editorLookup: projectEditorLookup(before),
    mechanism: projectMechanismRouteInput(before),
  };
  const afterMembership = {
    lookup: projectLookup(after),
    editorLookup: projectEditorLookup(after),
    mechanism: projectMechanismRouteInput(after),
  };
  if (projectionHash(beforeMembership) !== projectionHash(afterMembership)) {
    return "membership";
  }

  const beforeContent = {
    library: projectLibraryInput(before),
    search: projectSearchInput(before),
    preview: projectPublicPreview(before),
  };

  const afterContent = {
    library: projectLibraryInput(after),
    search: projectSearchInput(after),
    preview: projectPublicPreview(after),
  };
  if (projectionHash(beforeContent) !== projectionHash(afterContent)) return "content";

  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const changedFields = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  for (const field of changedFields) {
    if (STORAGE_IDENTITY_FIELDS.has(field)) continue;
    if (stableStringify(beforeRecord[field]) === stableStringify(afterRecord[field])) continue;
    if (!DETAIL_ONLY_FIELDS.has(field)) return "membership";
  }
  return "detail";
}
const DEPENDENCY_RANK: Record<SubstancePublicationDependency, number> = {
  detail: 0,
  content: 1,
  membership: 2,
};

/** Pending invalidation work can only broaden when publications coalesce. */
export function mergeSubstancePublicationDependency(
  left: SubstancePublicationDependency | undefined,
  right: SubstancePublicationDependency | undefined,
): SubstancePublicationDependency {
  const normalizedLeft = left ?? "membership";
  const normalizedRight = right ?? "membership";
  return DEPENDENCY_RANK[normalizedLeft] >= DEPENDENCY_RANK[normalizedRight]
    ? normalizedLeft
    : normalizedRight;
}
