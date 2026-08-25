const CLOSED_EYE_CONTENT_FAMILIES = new Set([
  "dark-surrealism",
  "generative-abstract-art",
  "traditional-cultural-art",
  "visionary-psychedelic-art",
]);

function hasReplicationContext(source) {
  return source?.role === "replication" || Boolean(source?.effect_slug);
}

function isExplicitFigure(row, source) {
  return source?.role === "figure" || row.contentFamily === "explanatory-figure";
}

function contextViewingMode(row) {
  return CLOSED_EYE_CONTENT_FAMILIES.has(row.contentFamily) ? "closed-eye" : "open-eye";
}

export function applySourceReplicationContext(row, source) {
  if (
    !["not-replication", "unclear"].includes(row.replicationStatus) ||
    !hasReplicationContext(source) ||
    isExplicitFigure(row, source)
  ) {
    return row;
  }

  const viewingMode = contextViewingMode(row);
  const effectLabel = source.effect_slug ? ` for ${source.effect_slug}` : "";
  const contextSignals = [
    ...(source.role === "replication" ? ["source-role-replication"] : []),
    ...(source.effect_slug ? [`effect:${source.effect_slug}`] : []),
  ];

  const {
    viewingMode: _viewingMode,
    viewingModeTags: _viewingModeTags,
    viewingModeConfidence: _viewingModeConfidence,
    viewingModeReviewRequired: _viewingModeReviewRequired,
    viewingModeRationale: _viewingModeRationale,
    ...rowWithoutViewingMode
  } = row;

  return {
    ...rowWithoutViewingMode,
    replicationStatus: "replication",
    replicationStatusConfidence: "high",
    replicationStatusReviewRequired: false,
    replicationStatusRationale:
      `The source library places this item in replication context${effectLabel}. ` +
      "Illustrative effect examples and traditional psychedelic artwork remain replication-gallery content even when the media does not synthetically distort a first-person scene.",
    viewingMode,
    viewingModeTags: [viewingMode],
    viewingModeConfidence: "high",
    viewingModeReviewRequired: false,
    viewingModeRationale:
      viewingMode === "closed-eye"
        ? "The item is self-contained visionary, cultural, surreal, or generative imagery without a persistent external-world substrate."
        : "The item demonstrates an effect through an external scene, object, photograph, illustration, or perceptual example.",
    taxonomyReviewRequired: Boolean(row.contentFamilyReviewRequired),
    decisionBasis: "source-replication-context",
    reviewEvidenceInspected: [
      ...new Set([...(row.reviewEvidenceInspected ?? []), "source-role-and-effect-context"]),
    ],
    contextReconciliation: {
      previousReplicationStatus: row.replicationStatus,
      previousDecisionBasis: row.decisionBasis,
      previousReplicationStatusRationale: row.replicationStatusRationale,
      sourceRole: source.role ?? null,
      sourceEffectSlug: source.effect_slug ?? null,
      sourceSignals: contextSignals,
    },
  };
}

export function reconcileSourceReplicationContext(rows, sourceRows) {
  const sourceById = new Map(sourceRows.map((source) => [source._id, source]));
  return rows.map((row) => applySourceReplicationContext(row, sourceById.get(row.productionId)));
}
