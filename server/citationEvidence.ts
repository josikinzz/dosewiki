import { citationEvidenceGateErrors } from "../lib/citations/citationSafety.mjs";
import { v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole, type AuthorizedActor } from "./lib/auth";
import type { CitationQueueSummary } from "./lib/citationQueueFilter";
import {
  mergeArticleReferenceMetadataForReplacement,
  remapReferenceIds,
} from "./lib/substanceIngestion";
import { substanceArticleLightValidator, validateArticleForIngestion } from "./lib/validators";

const evidenceStatus = v.union(
  v.literal("supported"),
  v.literal("needs_source"),
  v.literal("needs_review"),
  v.literal("approved"),
  v.literal("rejected"),
);

const evidenceWriteMode = v.union(
  v.literal("preserve"),
  v.literal("refresh"),
  v.literal("replace"),
);

const supportProofInput = v.object({
  sourceId: v.string(),
  matchType: v.union(v.literal("exact"), v.literal("normalized_whitespace")),
  startOffset: v.union(v.number(), v.null()),
  endOffset: v.union(v.number(), v.null()),
});

const entailmentVerdictInput = v.union(
  v.literal("entails"),
  v.literal("partial"),
  v.literal("does_not_entail"),
  v.literal("uncertain"),
);

const strictReviewEvidenceInput = v.object({
  decision: v.literal("approved"),
  reviewedBy: v.string(),
  reviewedAt: v.string(),
  claimKey: v.string(),
  fieldPath: v.string(),
  claimText: v.string(),
  referenceIds: v.array(v.string()),
  rationale: v.string(),
});

type CitationEntailmentVerdict = "entails" | "partial" | "does_not_entail" | "uncertain";

type StrictCitationReviewEvidence = {
  decision: "approved";
  reviewedBy: string;
  reviewedAt: string;
  claimKey: string;
  fieldPath: string;
  claimText: string;
  referenceIds: string[];
  rationale: string;
};

const supportInput = v.object({
  sourceId: v.string(),
  sourceName: v.string(),
  referenceId: v.string(),
  sourceType: v.optional(v.union(v.string(), v.null())),
  quality: v.optional(v.union(v.string(), v.null())),
  supportingQuote: v.string(),
  rationale: v.string(),
  verifiedQuote: supportProofInput,
});

const diagnosticInput = v.object({
  code: v.string(),
  message: v.string(),
  severity: v.union(v.literal("error"), v.literal("warning")),
  claimKey: v.optional(v.union(v.string(), v.null())),
});

const evidenceInput = v.object({
  section: v.string(),
  claimKey: v.string(),
  claimText: v.optional(v.string()),
  fieldPath: v.optional(v.string()),
  entailmentVerdict: v.optional(entailmentVerdictInput),
  strictReviewEvidence: v.optional(strictReviewEvidenceInput),
  referenceIds: v.array(v.string()),
  sourceName: v.optional(v.string()),
  sourceType: v.optional(v.string()),
  quality: v.optional(v.string()),
  status: evidenceStatus,
  statusReason: v.optional(v.string()),
  severity: v.union(v.literal("blocking"), v.literal("non_blocking")),
  confidence: v.optional(v.number()),
  supportingSnippet: v.optional(v.string()),
  supportRationale: v.optional(v.string()),
  supports: v.optional(v.array(supportInput)),
  diagnostics: v.optional(v.array(diagnosticInput)),
  provenance: v.optional(v.any()),
});

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function dedupeClaimKeys(claimKeys: string[] = []) {
  return [...new Set(
    claimKeys
      .map((claimKey) => String(claimKey ?? "").trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function sortEvidenceRows<T extends { section?: string; claimKey?: string; fieldPath?: string }>(rows: T[]) {
  return [...rows].sort((left, right) => (
    String(left.section ?? "").localeCompare(String(right.section ?? "")) ||
    String(left.claimKey ?? "").localeCompare(String(right.claimKey ?? "")) ||
    String(left.fieldPath ?? "").localeCompare(String(right.fieldPath ?? ""))
  ));
}

const citationArticlePatchFields = [
  "summary",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
  "references",
] as const;

export async function applyCitationArticlePatch({
  ctx,
  slug,
  article,
  includeReferences,
  expectedArticleId,
  expectedArticleSlug,
}: {
  ctx: MutationCtx;
  slug: string;
  article: Record<string, unknown>;
  includeReferences: boolean;
  expectedArticleId?: number | null;
  expectedArticleSlug?: string | null;
}) {
  const matches = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", slug))
    .take(2);

  if (matches.length === 0) {
    throw new Error(`No article found for slug: ${slug}`);
  }
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one article for slug "${slug}"; found multiple matches.`);
  }
  const [existing] = matches;
  const storedArticleId = typeof existing.id === "number" ? existing.id : null;
  const storedArticleSlug = typeof existing.slug === "string" && existing.slug.trim()
    ? existing.slug.trim()
    : null;
  if (typeof expectedArticleId === "number" && expectedArticleId !== storedArticleId) {
    throw new Error(
      `Citation draft article id ${expectedArticleId} does not match stored article id ${storedArticleId ?? "null"} for slug "${slug}".`,
    );
  }
  const normalizedExpectedSlug = typeof expectedArticleSlug === "string" && expectedArticleSlug.trim()
    ? expectedArticleSlug.trim()
    : null;
  if (normalizedExpectedSlug && normalizedExpectedSlug !== storedArticleSlug) {
    throw new Error(
      `Citation draft article slug "${normalizedExpectedSlug}" does not match stored article slug "${storedArticleSlug ?? "null"}".`,
    );
  }

  let patchSource = article;
  let referenceIdRemap = new Map<string, string>();
  if (includeReferences) {
    const merged = mergeArticleReferenceMetadataForReplacement(
      article,
      Array.isArray(existing.references) ? existing.references : [],
    );
    patchSource = merged.article;
    referenceIdRemap = merged.remap;
  }

  const patch: Record<string, unknown> = {};
  for (const field of citationArticlePatchFields) {
    if (field === "references" && !includeReferences) continue;
    if (Object.prototype.hasOwnProperty.call(patchSource, field)) {
      patch[field] = patchSource[field];
    }
  }

  await ctx.db.patch(existing._id, patch);

  const canonicalSlug = storedArticleSlug ?? slug;
  const affectedPaths = ["/substances", `/${canonicalSlug}`].sort();

  return {
    action: "updated" as const,
    dataId: existing._id,
    articleId: storedArticleId,
    title: typeof existing.title === "string" ? existing.title : slug,
    canonicalSlug,
    affectedPaths,
    referenceIdRemap,
  };
}

function formatUpdatedBy(actor: AuthorizedActor) {
  if (actor.authMethod === "apiKey") {
    return `apiKey:${actor.adminIntent ?? "legacyAdmin"}:${actor.email}`;
  }

  return `identity:${actor.email}`;
}

function resolveApprovedWriteMode(args: {
  approvedWriteMode?: "preserve" | "refresh" | "replace";
  preserveApproved?: boolean;
}) {
  if (args.approvedWriteMode) {
    return args.approvedWriteMode;
  }

  if (args.preserveApproved === false) {
    return "refresh";
  }

  return "preserve";
}

function normalizeEvidenceSupports(row: {
  supports?: Array<{
    sourceId: string;
    sourceName: string;
    referenceId: string;
    sourceType?: string | null;
    quality?: string | null;
    supportingQuote: string;
    rationale: string;
    verifiedQuote: {
      sourceId: string;
      matchType: "exact" | "normalized_whitespace";
      startOffset: number | null;
      endOffset: number | null;
    };
  }>;
  sourceName?: string;
  sourceType?: string;
  quality?: string;
  referenceIds: string[];
  supportingSnippet?: string;
  supportRationale?: string;
}) {
  const supports = Array.isArray(row.supports) ? row.supports : [];
  if (supports.length > 0) {
    return [...supports].sort((left, right) => (
      left.referenceId.localeCompare(right.referenceId) ||
      left.sourceId.localeCompare(right.sourceId) ||
      left.supportingQuote.localeCompare(right.supportingQuote) ||
      left.rationale.localeCompare(right.rationale)
    ));
  }

  return [];
}

function validateEvidenceRow(row: {
  section: string;
  claimKey: string;
  claimText?: string;
  fieldPath?: string;
  entailmentVerdict?: CitationEntailmentVerdict;
  strictReviewEvidence?: StrictCitationReviewEvidence;
  referenceIds: string[];
  sourceName?: string;
  sourceType?: string;
  quality?: string;
  status: "supported" | "needs_source" | "needs_review" | "approved" | "rejected";
  statusReason?: string;
  severity: "blocking" | "non_blocking";
  confidence?: number;
  supportingSnippet?: string;
  supportRationale?: string;
  supports?: Array<{
    sourceId: string;
    sourceName: string;
    referenceId: string;
    sourceType?: string | null;
    quality?: string | null;
    supportingQuote: string;
    rationale: string;
    verifiedQuote: {
      sourceId: string;
      matchType: "exact" | "normalized_whitespace";
      startOffset: number | null;
      endOffset: number | null;
    };
  }>;
  diagnostics?: Array<{
    code: string;
    message: string;
    severity: "error" | "warning";
    claimKey?: string | null;
  }>;
  provenance?: unknown;
}) {
  invariant(typeof row.section === "string" && row.section.trim(), "Evidence rows require a non-empty section.");
  invariant(typeof row.claimKey === "string" && row.claimKey.trim(), "Evidence rows require a non-empty claimKey.");
  invariant(typeof row.fieldPath === "string" && row.fieldPath.trim(), "Evidence rows require a non-empty fieldPath.");

  const supports = normalizeEvidenceSupports(row);
  const referenceIds = supports.map((support) => support.referenceId);

  for (const support of supports) {
    invariant(support.sourceId.trim(), `Evidence support ${row.claimKey} is missing sourceId.`);
    invariant(support.sourceName.trim(), `Evidence support ${row.claimKey} is missing sourceName.`);
    invariant(support.referenceId.trim(), `Evidence support ${row.claimKey} is missing referenceId.`);
    invariant(support.supportingQuote.trim(), `Evidence support ${row.claimKey} is missing supportingQuote.`);
    invariant(support.rationale.trim(), `Evidence support ${row.claimKey} is missing rationale.`);
    invariant(
      support.verifiedQuote?.sourceId === support.sourceId,
      `Evidence support ${row.claimKey} must carry a verifiedQuote tied to the same sourceId.`,
    );
  }

  if (supports.length > 0) {
    invariant(
      JSON.stringify(row.referenceIds) === JSON.stringify(referenceIds),
      `Evidence row ${row.claimKey} must keep referenceIds aligned with supports.`,
    );
  }

  if (row.status === "supported" || row.status === "approved") {
    invariant(supports.length > 0, `${row.status} evidence rows require one or more verified supports.`);
  }

  if (row.status === "needs_source") {
    invariant(supports.length === 0, `${row.status} evidence rows cannot persist verified supports.`);
    invariant(row.referenceIds.length === 0, `${row.status} evidence rows cannot persist referenceIds.`);
  }

  if (row.status === "rejected" && supports.length === 0) {
    invariant(row.referenceIds.length === 0, `${row.status} evidence rows without supports cannot persist referenceIds.`);
  }

  if (supports.length > 1) {
    invariant(!row.sourceName, `Multi-support evidence row ${row.claimKey} cannot use ambiguous top-level sourceName.`);
    invariant(!row.supportingSnippet, `Multi-support evidence row ${row.claimKey} cannot use ambiguous top-level supportingSnippet.`);
    invariant(!row.supportRationale, `Multi-support evidence row ${row.claimKey} cannot use ambiguous top-level supportRationale.`);
  }

  if (supports.length === 1) {
    const [support] = supports;
    if (row.sourceName) {
      invariant(row.sourceName === support.sourceName, `Evidence row ${row.claimKey} has mismatched sourceName.`);
    }
    if (row.supportingSnippet) {
      invariant(row.supportingSnippet === support.supportingQuote, `Evidence row ${row.claimKey} has mismatched supportingSnippet.`);
    }
    if (row.supportRationale) {
      invariant(row.supportRationale === support.rationale, `Evidence row ${row.claimKey} has mismatched supportRationale.`);
    }
  }

  if (row.status === "approved") {
    assertEvidenceCanPublish(row);
  }

  return {
    ...row,
    referenceIds,
    supports,
    sourceName: supports.length === 1 ? supports[0].sourceName : undefined,
    sourceType: supports.length === 1 ? (supports[0].sourceType ?? undefined) : undefined,
    quality: supports.length === 1 ? (supports[0].quality ?? undefined) : undefined,
    supportingSnippet: supports.length === 1 ? supports[0].supportingQuote : undefined,
    supportRationale: supports.length === 1 ? supports[0].rationale : undefined,
  };
}

function assertEvidenceCanPublish(row: {
  claimKey: string;
  claimText?: string;
  fieldPath?: string;
  referenceIds: string[];
  entailmentVerdict?: CitationEntailmentVerdict;
  strictReviewEvidence?: StrictCitationReviewEvidence;
}) {
  const errors = citationEvidenceGateErrors(row);
  invariant(
    errors.length === 0,
    `Evidence row ${row.claimKey} cannot be approved or applied: ${errors.join("; ")}.`,
  );
}

type CitationEvidenceReviewReader = {
  getCitationEvidenceReviewRows: (slug: string) => Promise<Array<
    Record<string, unknown> & { section?: string; claimKey?: string; fieldPath?: string }
  >>;
  getCitationQueueSummaries: () => Promise<CitationQueueSummary[]>;
};

export const getBySlug = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "citationEvidenceReview",
    }, "editor");

    const reader = ctx.db as typeof ctx.db & CitationEvidenceReviewReader;
    return sortEvidenceRows(await reader.getCitationEvidenceReviewRows(args.slug));
  },
});

export const getQueueSummary = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "citationEvidenceReview",
    }, "editor");

    const reader = ctx.db as typeof ctx.db & CitationEvidenceReviewReader;
    return await reader.getCitationQueueSummaries();
  },
});

async function applyEvidenceWrite({
  ctx,
  slug,
  articleId,
  evidence,
  approvedWriteMode,
  staleClaimKeys = [],
  actor,
  now,
}: {
  ctx: MutationCtx;
  slug: string;
  articleId?: number | null;
  evidence: Array<{
    section: string;
    claimKey: string;
    claimText?: string;
    fieldPath?: string;
    entailmentVerdict?: CitationEntailmentVerdict;
    strictReviewEvidence?: StrictCitationReviewEvidence;
    referenceIds: string[];
    sourceName?: string;
    sourceType?: string;
    quality?: string;
    status: "supported" | "needs_source" | "needs_review" | "approved" | "rejected";
    statusReason?: string;
    severity: "blocking" | "non_blocking";
    confidence?: number;
    supportingSnippet?: string;
    supportRationale?: string;
    supports?: Array<{
      sourceId: string;
      sourceName: string;
      referenceId: string;
      sourceType?: string | null;
      quality?: string | null;
      supportingQuote: string;
      rationale: string;
      verifiedQuote: {
        sourceId: string;
        matchType: "exact" | "normalized_whitespace";
        startOffset: number | null;
        endOffset: number | null;
      };
    }>;
    diagnostics?: Array<{
      code: string;
      message: string;
      severity: "error" | "warning";
      claimKey?: string | null;
    }>;
    provenance?: unknown;
  }>;
  approvedWriteMode: "preserve" | "refresh" | "replace";
  staleClaimKeys?: string[];
  actor: AuthorizedActor;
  now: string;
}) {
  const existingRows = await ctx.db
    .query("citationEvidence")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();
  const existingByClaim = new Map(existingRows.map((row) => [row.claimKey, row]));
  const incomingClaimKeys = new Set<string>();
  const results = {
    created: 0,
    updated: 0,
    preservedApproved: 0,
    deletedStale: 0,
    preservedStale: 0,
    approvedWriteMode,
  };

  for (const row of sortEvidenceRows(evidence)) {
    const normalizedRow = validateEvidenceRow(row);
    incomingClaimKeys.add(normalizedRow.claimKey);
    const existing = existingByClaim.get(normalizedRow.claimKey);

    if (existing?.status === "approved" && approvedWriteMode === "preserve") {
      results.preservedApproved++;
      continue;
    }

    const payload = {
      slug,
      articleId,
      ...normalizedRow,
      updatedAt: now,
      updatedBy: formatUpdatedBy(actor),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      results.updated++;
    } else {
      await ctx.db.insert("citationEvidence", { ...payload, createdAt: now });
      results.created++;
    }
  }

  for (const staleClaimKey of dedupeClaimKeys(staleClaimKeys)) {
    if (incomingClaimKeys.has(staleClaimKey)) {
      continue;
    }

    const existing = existingByClaim.get(staleClaimKey);
    if (!existing) {
      continue;
    }

    if (approvedWriteMode === "replace") {
      await ctx.db.delete(existing._id);
      results.deletedStale++;
      continue;
    }

    results.preservedStale++;
  }

  return results;
}

export const upsertMany = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    articleId: v.optional(v.union(v.number(), v.null())),
    evidence: v.array(evidenceInput),
    approvedWriteMode: v.optional(evidenceWriteMode),
    staleClaimKeys: v.optional(v.array(v.string())),
    preserveApproved: v.optional(v.boolean()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "citationEvidenceWrite",
    }, "admin");
    const now = new Date().toISOString();
    return await applyEvidenceWrite({
      ctx,
      slug: args.slug,
      articleId: args.articleId,
      evidence: args.evidence,
      approvedWriteMode: resolveApprovedWriteMode(args),
      staleClaimKeys: args.staleClaimKeys,
      actor,
      now,
    });
  },
});

export const applyDraft = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    article: substanceArticleLightValidator,
    evidence: v.array(evidenceInput),
    approvedWriteMode: v.optional(evidenceWriteMode),
    staleClaimKeys: v.optional(v.array(v.string())),
    preserveApproved: v.optional(v.boolean()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "citationEvidenceWrite",
    }, "admin");

    // Run the shared Zod article contract before patching citable sections so
    // citation applies cannot persist structurally invalid article content.
    const validation = validateArticleForIngestion(args.article);
    if (validation.ok === false) {
      throw new Error(
        `Citation draft for "${args.slug}" failed the article contract: ${validation.message}`,
      );
    }

    // Validate every evidence row and every publishable entailment before the
    // article patch. A failed citation gate must leave article and evidence
    // storage untouched.
    for (const row of args.evidence) {
      const normalizedRow = validateEvidenceRow(row);
      if (normalizedRow.status === "supported" || normalizedRow.status === "approved") {
        assertEvidenceCanPublish(normalizedRow);
      }
    }

    const articleResult = await applyCitationArticlePatch({
      ctx,
      slug: args.slug,
      article: validation.article,
      // The Zod contract defaults omitted references to [], so consult the
      // original mutation input to distinguish "not patched" from an explicit
      // replacement with an empty reference set.
      includeReferences: Object.prototype.hasOwnProperty.call(args.article, "references"),
      expectedArticleId: validation.article.id,
      expectedArticleSlug: validation.article.slug,
    });
    const { referenceIdRemap, ...serializableArticleResult } = articleResult;
    const remappedEvidence = remapReferenceIds(
      args.evidence,
      referenceIdRemap,
    ) as typeof args.evidence;

    const now = new Date().toISOString();
    const evidenceResult = await applyEvidenceWrite({
      ctx,
      slug: args.slug,
      articleId: articleResult.articleId,
      evidence: remappedEvidence,
      approvedWriteMode: resolveApprovedWriteMode(args),
      staleClaimKeys: args.staleClaimKeys,
      actor,
      now,
    });

    return {
      article: {
        updated: serializableArticleResult.action === "updated",
        id: serializableArticleResult.dataId,
        outcome: serializableArticleResult,
        affectedPaths: serializableArticleResult.affectedPaths,
      },
      evidence: evidenceResult,
    };
  },
});

function normalizeExistingEvidenceRow(existing: {
  section: string;
  claimKey: string;
  claimText?: string;
  fieldPath?: string;
  entailmentVerdict?: CitationEntailmentVerdict;
  strictReviewEvidence?: StrictCitationReviewEvidence;
  referenceIds: string[];
  sourceName?: string;
  sourceType?: string;
  quality?: string;
  status: "supported" | "needs_source" | "needs_review" | "approved" | "rejected";
  statusReason?: string;
  severity: "blocking" | "non_blocking";
  confidence?: number;
  supportingSnippet?: string;
  supportRationale?: string;
  supports?: Array<{
    sourceId: string;
    sourceName: string;
    referenceId: string;
    sourceType?: string | null;
    quality?: string | null;
    supportingQuote: string;
    rationale: string;
    verifiedQuote: {
      sourceId: string;
      matchType: "exact" | "normalized_whitespace";
      startOffset: number | null;
      endOffset: number | null;
    };
  }>;
  diagnostics?: Array<{
    code: string;
    message: string;
    severity: "error" | "warning";
    claimKey?: string | null;
  }>;
  provenance?: unknown;
}) {
  return validateEvidenceRow({
    section: existing.section,
    claimKey: existing.claimKey,
    claimText: existing.claimText,
    fieldPath: existing.fieldPath,
    entailmentVerdict: existing.entailmentVerdict,
    strictReviewEvidence: existing.strictReviewEvidence,
    referenceIds: existing.referenceIds,
    sourceName: existing.sourceName,
    sourceType: existing.sourceType,
    quality: existing.quality,
    status: existing.status,
    statusReason: existing.statusReason,
    severity: existing.severity,
    confidence: existing.confidence,
    supportingSnippet: existing.supportingSnippet,
    supportRationale: existing.supportRationale,
    supports: existing.supports,
    diagnostics: existing.diagnostics,
    provenance: existing.provenance,
  });
}

export const setManyStatus = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    claimKeys: v.array(v.string()),
    status: evidenceStatus,
    // Reviewer's note for the next editor; replaces whatever the row carried.
    statusReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "citationEvidenceReview",
    }, "admin");
    const now = new Date().toISOString();
    const existingRows = await ctx.db
      .query("citationEvidence")
      .withIndex("by_slug", (query) => query.eq("slug", args.slug))
      .collect();
    const rowsByClaimKey = new Map(existingRows.map((row) => [row.claimKey, row]));
    let updated = 0;

    for (const claimKey of dedupeClaimKeys(args.claimKeys)) {
      const existing = rowsByClaimKey.get(claimKey);
      if (!existing) {
        continue;
      }

      const normalized = normalizeExistingEvidenceRow({
        ...existing,
        status: args.status,
        statusReason: args.statusReason?.trim() || undefined,
      });

      await ctx.db.patch(existing._id, {
        status: normalized.status,
        statusReason: normalized.statusReason,
        referenceIds: normalized.referenceIds,
        sourceName: normalized.sourceName,
        sourceType: normalized.sourceType,
        quality: normalized.quality,
        supportingSnippet: normalized.supportingSnippet,
        supportRationale: normalized.supportRationale,
        supports: normalized.supports,
        updatedAt: now,
        updatedBy: formatUpdatedBy(actor),
      });
      updated += 1;
    }

    return { updated };
  },
});
