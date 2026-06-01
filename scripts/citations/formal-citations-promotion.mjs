import { buildCitationPromotionPlan } from "./citation-promotion-applicator.mjs";

export function buildFormalCitationPromotionPlan({
  draft,
  slug = draft?.slug,
  approvedWriteMode = "preserve",
}) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw new Error("Formal citation promotion requires a merged draft.");
  }

  const staleClaimKeys = (draft.staleEvidence ?? [])
    .map((row) => row?.claimKey)
    .filter(Boolean);

  return buildCitationPromotionPlan({
    source: "formal-citations",
    slug,
    title: draft.title,
    article: draft.article,
    evidence: draft.evidence ?? [],
    changes: draft.changes ?? [],
    references: draft.references ?? [],
    gaps: draft.gaps ?? [],
    staleClaimKeys,
    approvedWriteMode,
    summary: {
      references: draft.references?.length ?? 0,
      evidenceRows: draft.evidence?.length ?? 0,
      gaps: draft.gaps?.length ?? 0,
      preservedApproved: draft.preservedApproved?.length ?? 0,
      newSupport: draft.newSupport?.length ?? 0,
      proposedReplacements: draft.proposedReplacements?.length ?? 0,
      staleEvidence: draft.staleEvidence?.length ?? 0,
      staleReferences: draft.staleReferences?.length ?? 0,
      articleChanges: draft.changes?.length ?? 0,
    },
  });
}
