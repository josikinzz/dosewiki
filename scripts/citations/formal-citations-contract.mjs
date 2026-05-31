import { z } from "zod";

import { collectFormalCitationReferences } from "./formal-citations-reference-catalog.mjs";
import { normalizeFormalCitationSectionKey } from "./formal-citations-section-config.mjs";

export const FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION = "formal_citations_section_v1";

const CLAIM_STATUSES = ["supported", "needs_review", "needs_source"];

const quoteProofSchema = z.object({
  sourceId: z.string().min(1),
  matchType: z.enum(["exact", "normalized_whitespace"]),
  startOffset: z.number().int().min(0).nullable(),
  endOffset: z.number().int().min(0).nullable(),
}).strict();

const diagnosticSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["error", "warning"]),
  claimKey: z.string().min(1).nullable(),
}).strict();

const validatedSupportSchema = z.object({
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  referenceId: z.string().min(1),
  sourceType: z.string().min(1).nullable(),
  quality: z.string().min(1).nullable(),
  supportingQuote: z.string().min(1),
  rationale: z.string().min(1),
  verifiedQuote: quoteProofSchema,
}).strict();

const validatedClaimSchema = z.object({
  claimKey: z.string().min(1),
  fieldPath: z.string().min(1),
  claimText: z.string().min(1),
  status: z.enum(CLAIM_STATUSES),
  originalStatus: z.enum(CLAIM_STATUSES).nullable(),
  statusReason: z.string(),
  referenceIds: z.array(z.string().min(1)),
  supports: z.array(validatedSupportSchema),
  diagnostics: z.array(diagnosticSchema),
}).strict();

const validatedSectionResultSchema = z.object({
  schemaVersion: z.literal(FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION),
  sectionKey: z.string().min(1),
  summary: z.string(),
  notes: z.array(z.string()),
  claims: z.array(validatedClaimSchema),
  diagnostics: z.array(diagnosticSchema),
  validationSummary: z.object({
    targetCount: z.number().int().min(0),
    emittedClaimCount: z.number().int().min(0),
    diagnosticCount: z.number().int().min(0),
    downgradedClaimCount: z.number().int().min(0),
  }).strict(),
}).strict();

const trimmedStringSchema = z.preprocess((value) => (
  typeof value === "string" ? value.trim() : value
), z.string());

const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}, z.string().nullable());

const rawClaimSchema = z.object({
  claimKey: trimmedStringSchema,
  fieldPath: trimmedStringSchema.optional().default(""),
  claimText: trimmedStringSchema.optional().default(""),
  status: z.enum(CLAIM_STATUSES),
  statusReason: trimmedStringSchema.optional().default(""),
  supports: z.array(z.object({
    sourceId: nullableTrimmedStringSchema.optional().default(null),
    sourceName: nullableTrimmedStringSchema.optional().default(null),
    referenceId: nullableTrimmedStringSchema.optional().default(null),
    supportingQuote: trimmedStringSchema.optional().default(""),
    rationale: trimmedStringSchema.optional().default(""),
  }).strict()).optional().default([]),
  sourceId: nullableTrimmedStringSchema.optional().default(null),
  sourceName: nullableTrimmedStringSchema.optional().default(null),
  referenceId: nullableTrimmedStringSchema.optional().default(null),
  supportingQuote: trimmedStringSchema.optional().default(""),
  rationale: trimmedStringSchema.optional().default(""),
}).strict();

const rawSectionPayloadSchema = z.object({
  schemaVersion: z.literal(FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION),
  sectionKey: trimmedStringSchema,
  summary: trimmedStringSchema.optional().default(""),
  notes: z.array(trimmedStringSchema).optional().default([]),
  claims: z.array(rawClaimSchema),
}).strict();

function diagnostic(code, message, { severity = "error", claimKey = null } = {}) {
  return { code, message, severity, claimKey };
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeNeedle(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function formatZodIssues(error) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

function coerceSectionPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const normalized = { ...payload };
  if (typeof normalized.sectionKey !== "string" && typeof normalized.section === "string") {
    normalized.sectionKey = normalized.section;
  }
  delete normalized.section;
  return normalized;
}

function coerceRawClaim(rawClaim) {
  const normalized = { ...rawClaim };
  if (!normalized.statusReason && normalized.rationale) {
    normalized.statusReason = normalized.rationale;
  }

  const hasExplicitSupports = Array.isArray(normalized.supports) && normalized.supports.length > 0;
  const hasLegacySupportFields = Boolean(
    normalized.sourceId ||
    normalized.sourceName ||
    normalized.referenceId ||
    normalized.supportingQuote ||
    normalized.rationale,
  );

  if (!hasExplicitSupports && hasLegacySupportFields) {
    normalized.supports = [{
      sourceId: normalized.sourceId ?? null,
      sourceName: normalized.sourceName ?? null,
      referenceId: normalized.referenceId ?? null,
      supportingQuote: normalized.supportingQuote ?? "",
      rationale: normalized.rationale ?? "",
    }];
  }

  if (!Array.isArray(normalized.supports)) {
    normalized.supports = [];
  }

  return normalized;
}

function buildSourceCatalog({ sourcePacket, articleSources }) {
  const compiledSources = Array.isArray(sourcePacket?.compiledSources)
    ? sourcePacket.compiledSources
    : [];

  return new Map(
    compiledSources
      .filter((source) => source?.id && typeof source.displayName === "string")
      .map((source) => {
        const content = typeof articleSources?.contents?.[source.id] === "string"
          ? articleSources.contents[source.id]
          : "";
        return [
          source.id,
          {
            id: source.id,
            displayName: source.displayName.trim(),
            excerpt: typeof source.excerpt === "string" ? source.excerpt : "",
            content,
          },
        ];
      }),
  );
}

function buildSourceNameIndex(sourcesById) {
  const byName = new Map();
  for (const source of sourcesById.values()) {
    const key = normalizeNeedle(source.displayName);
    if (!key) continue;
    const bucket = byName.get(key) ?? [];
    bucket.push(source);
    byName.set(key, bucket);
  }
  return byName;
}

function buildReferenceCatalog(article, sourcePacket) {
  const references = [
    ...collectFormalCitationReferences(article),
    ...(Array.isArray(sourcePacket?.allowedReferences) ? sourcePacket.allowedReferences : []),
  ];
  return new Map(
    references
      .filter((reference) => reference?.id)
      .map((reference) => [reference.id, reference]),
  );
}

function resolveSourceCandidate(rawClaim, sourcesById, sourcesByName, claimDiagnostics) {
  if (!rawClaim.sourceId && !rawClaim.sourceName) {
    return null;
  }

  if (!rawClaim.sourceId) {
    claimDiagnostics.push(diagnostic(
      "missing_source_id",
      "Supporting claims must identify a bounded source by sourceId.",
      { claimKey: rawClaim.claimKey },
    ));
    return null;
  }

  const source = sourcesById.get(rawClaim.sourceId);
  if (!source) {
    claimDiagnostics.push(diagnostic(
      "unknown_source_id",
      `sourceId "${rawClaim.sourceId}" is not present in the bounded source packet.`,
      { claimKey: rawClaim.claimKey },
    ));
    return null;
  }

  if (!rawClaim.sourceName) {
    claimDiagnostics.push(diagnostic(
      "missing_source_name",
      "Supporting claims must echo the source display name from the bounded source packet.",
      { claimKey: rawClaim.claimKey },
    ));
    return null;
  }

  const matchingByName = sourcesByName.get(normalizeNeedle(rawClaim.sourceName)) ?? [];
  const exactNameMatch = matchingByName.find((entry) => entry.id === source.id);
  if (!exactNameMatch) {
    claimDiagnostics.push(diagnostic(
      "source_name_mismatch",
      `sourceName "${rawClaim.sourceName}" does not match sourceId "${rawClaim.sourceId}".`,
      { claimKey: rawClaim.claimKey },
    ));
    return null;
  }

  return exactNameMatch;
}

function resolveReferenceCandidate(rawClaim, referencesById, claimDiagnostics) {
  if (!rawClaim.referenceId) {
    claimDiagnostics.push(diagnostic(
      "missing_reference_id",
      "Supporting claims must identify an allowed referenceId before merge.",
      { claimKey: rawClaim.claimKey },
    ));
    return null;
  }

  const reference = referencesById.get(rawClaim.referenceId);
  if (!reference) {
    claimDiagnostics.push(diagnostic(
      "unknown_reference_id",
      `referenceId "${rawClaim.referenceId}" is not present in the allowed section references.`,
      { claimKey: rawClaim.claimKey },
    ));
    return null;
  }

  return reference;
}

function referenceMatchesSource(reference, source) {
  const explicitSourceIds = Array.isArray(reference?.sourceIds)
    ? reference.sourceIds.map((entry) => normalizeNeedle(entry))
    : [];
  const explicitProvenanceSourceIds = Array.isArray(reference?.provenance)
    ? reference.provenance
      .map((entry) => normalizeNeedle(entry?.sourceId))
      .filter(Boolean)
    : [];
  const sourceId = normalizeNeedle(source?.id ?? "");
  if (sourceId && [...explicitSourceIds, ...explicitProvenanceSourceIds].includes(sourceId)) {
    return true;
  }

  const haystack = normalizeNeedle(
    `${reference?.title ?? ""} ${reference?.siteName ?? ""} ${reference?.url ?? ""}`,
  );
  const sourceName = normalizeNeedle(source?.displayName ?? "");
  if (!haystack || (!sourceName && !sourceId)) return false;
  return haystack.includes(sourceName) || haystack.includes(sourceId);
}

function sortValidatedSupports(supports) {
  return [...supports].sort((left, right) => (
    left.referenceId.localeCompare(right.referenceId) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.supportingQuote.localeCompare(right.supportingQuote) ||
    left.rationale.localeCompare(right.rationale)
  ));
}

function referenceIdsFromValidatedSupports(supports) {
  return sortValidatedSupports(supports).map((support) => support.referenceId);
}

function normalizeValidatedSupports(supports, claimDiagnostics, claimKey) {
  const sorted = sortValidatedSupports(supports);
  const deduped = [];
  const byReferenceId = new Map();

  for (const support of sorted) {
    const signature = JSON.stringify([
      support.referenceId,
      support.sourceId,
      support.supportingQuote,
      support.rationale,
    ]);
    const existing = byReferenceId.get(support.referenceId);
    if (!existing) {
      byReferenceId.set(support.referenceId, { signature, support });
      deduped.push(support);
      continue;
    }

    if (existing.signature === signature) {
      claimDiagnostics.push(diagnostic(
        "duplicate_support_reference",
        `referenceId "${support.referenceId}" was emitted more than once for the same claim.`,
        { claimKey },
      ));
      continue;
    }

    claimDiagnostics.push(diagnostic(
      "conflicting_support_reference",
      `referenceId "${support.referenceId}" was emitted with conflicting support details for the same claim.`,
      { claimKey },
    ));
  }

  return deduped;
}

function verifySupportingQuote(source, supportingQuote) {
  const quote = String(supportingQuote ?? "").trim();
  if (!quote) return null;

  const sourceText = typeof source?.content === "string" && source.content.trim()
    ? source.content
    : source?.excerpt ?? "";

  if (!sourceText) return null;

  const exactIndex = sourceText.indexOf(quote);
  if (exactIndex >= 0) {
    return {
      sourceId: source.id,
      matchType: "exact",
      startOffset: exactIndex,
      endOffset: exactIndex + quote.length,
    };
  }

  const normalizedSource = normalizeWhitespace(sourceText);
  const normalizedQuote = normalizeWhitespace(quote);
  if (!normalizedQuote) return null;
  const normalizedIndex = normalizedSource.indexOf(normalizedQuote);
  if (normalizedIndex >= 0) {
    return {
      sourceId: source.id,
      matchType: "normalized_whitespace",
      startOffset: null,
      endOffset: null,
    };
  }

  return null;
}

function finalizeNeedsSourceClaim(target, rawClaim, claimDiagnostics, fallbackRationale) {
  const statusReason = rawClaim?.statusReason || fallbackRationale;
  return {
    claimKey: target.claimKey,
    fieldPath: target.fieldPath,
    claimText: target.claimText,
    status: "needs_source",
    originalStatus: rawClaim?.status ?? null,
    statusReason,
    referenceIds: [],
    supports: [],
    diagnostics: claimDiagnostics,
  };
}

function finalizeNeedsReviewClaim(
  target,
  rawClaim,
  claimDiagnostics,
  {
    statusReason = "",
    supports = [],
  } = {},
) {
  const normalizedSupports = sortValidatedSupports(supports);
  return {
    claimKey: target.claimKey,
    fieldPath: target.fieldPath,
    claimText: target.claimText,
    status: "needs_review",
    originalStatus: rawClaim?.status ?? null,
    statusReason: statusReason || rawClaim?.statusReason || "Validation could not prove direct support safely.",
    referenceIds: referenceIdsFromValidatedSupports(normalizedSupports),
    supports: normalizedSupports,
    diagnostics: claimDiagnostics,
  };
}

function validateRawSupportForClaim({
  rawSupport,
  target,
  sourcesById,
  sourcesByName,
  referencesById,
}) {
  const claimDiagnostics = [];
  const support = {
    sourceId: rawSupport?.sourceId ?? null,
    sourceName: rawSupport?.sourceName ?? null,
    referenceId: rawSupport?.referenceId ?? null,
    supportingQuote: rawSupport?.supportingQuote ?? "",
    rationale: rawSupport?.rationale ?? "",
  };

  const source = resolveSourceCandidate(support, sourcesById, sourcesByName, claimDiagnostics);
  const reference = support.referenceId
    ? resolveReferenceCandidate(support, referencesById, claimDiagnostics)
    : null;

  if (source && reference && !referenceMatchesSource(reference, source)) {
    claimDiagnostics.push(diagnostic(
      "source_reference_mismatch",
      `referenceId "${reference.id}" does not align with sourceId "${source.id}".`,
      { claimKey: target.claimKey },
    ));
  }

  if (!support.supportingQuote) {
    claimDiagnostics.push(diagnostic(
      "missing_supporting_quote",
      "Each support entry requires a non-empty supportingQuote.",
      { claimKey: target.claimKey },
    ));
  }

  if (!support.rationale) {
    claimDiagnostics.push(diagnostic(
      "missing_rationale",
      "Each support entry requires a non-empty rationale.",
      { claimKey: target.claimKey },
    ));
  }

  let verifiedQuote = null;
  if (support.supportingQuote) {
    if (!source) {
      claimDiagnostics.push(diagnostic(
        "quote_without_valid_source",
        "supportingQuote cannot be verified without a valid sourceId/sourceName pair.",
        { claimKey: target.claimKey },
      ));
    } else {
      verifiedQuote = verifySupportingQuote(source, support.supportingQuote);
      if (!verifiedQuote) {
        claimDiagnostics.push(diagnostic(
          "quote_not_found",
          `supportingQuote was not found verbatim in bounded source "${source.id}".`,
          { claimKey: target.claimKey },
        ));
      }
    }
  }

  const strictSupportValid = Boolean(
    source &&
    reference &&
    referenceMatchesSource(reference, source) &&
    verifiedQuote &&
    support.supportingQuote &&
    support.rationale &&
    claimDiagnostics.length === 0
  );

  return {
    diagnostics: claimDiagnostics,
    support: strictSupportValid
      ? {
          sourceId: source.id,
          sourceName: source.displayName,
          referenceId: reference.id,
          sourceType: reference.sourceType ?? null,
          quality: reference.quality ?? null,
          supportingQuote: support.supportingQuote,
          rationale: support.rationale,
          verifiedQuote,
        }
      : null,
  };
}

function validateRawClaimForTarget({
  rawClaim,
  target,
  sourcesById,
  sourcesByName,
  referencesById,
}) {
  const claimDiagnostics = [];
  const supportLikeFieldPresent = rawClaim.supports.length > 0 || Boolean(
    rawClaim.sourceId ||
    rawClaim.sourceName ||
    rawClaim.referenceId ||
    rawClaim.supportingQuote,
  );

  if (rawClaim.fieldPath !== target.fieldPath) {
    claimDiagnostics.push(diagnostic(
      "field_path_mismatch",
      `fieldPath must echo "${target.fieldPath}" exactly for ${target.claimKey}.`,
      { claimKey: target.claimKey },
    ));
  }

  if (rawClaim.claimText !== target.claimText) {
    claimDiagnostics.push(diagnostic(
      "claim_text_mismatch",
      `claimText must echo the current article target exactly for ${target.claimKey}.`,
      { claimKey: target.claimKey },
    ));
  }

  if (claimDiagnostics.length > 0) {
    return finalizeNeedsReviewClaim(target, rawClaim, claimDiagnostics);
  }

  if (rawClaim.status === "needs_source") {
    if (supportLikeFieldPresent) {
      claimDiagnostics.push(diagnostic(
        "needs_source_support_fields_forbidden",
        "needs_source claims cannot carry source, reference, or quote fields.",
        { claimKey: target.claimKey },
      ));
    }
    return finalizeNeedsSourceClaim(
      target,
      rawClaim,
      claimDiagnostics,
      rawClaim.statusReason || "The bounded sources did not prove this claim directly.",
    );
  }

  if (rawClaim.status === "supported" && rawClaim.supports.length === 0) {
    claimDiagnostics.push(diagnostic(
      "missing_supports",
      "supported claims require one or more strict support entries.",
      { claimKey: target.claimKey },
    ));
    return finalizeNeedsSourceClaim(
      target,
      rawClaim,
      claimDiagnostics,
      rawClaim.statusReason || "The bounded sources did not provide any strict support entries for this claim.",
    );
  }

  const validatedSupports = [];
  for (const rawSupport of rawClaim.supports) {
    const supportValidation = validateRawSupportForClaim({
      rawSupport,
      target,
      sourcesById,
      sourcesByName,
      referencesById,
    });
    claimDiagnostics.push(...supportValidation.diagnostics);
    if (supportValidation.support) {
      validatedSupports.push(supportValidation.support);
    }
  }

  const normalizedSupports = normalizeValidatedSupports(
    validatedSupports,
    claimDiagnostics,
    target.claimKey,
  );

  if (rawClaim.status === "supported") {
    if (normalizedSupports.length === 0) {
      const needsReviewWithoutValidatedSupport = claimDiagnostics.some((entry) => (
        ![
          "missing_supports",
          "missing_supporting_quote",
          "quote_not_found",
        ].includes(entry.code)
      ));
      if (needsReviewWithoutValidatedSupport) {
        return finalizeNeedsReviewClaim(target, rawClaim, claimDiagnostics, {
          statusReason: rawClaim.statusReason || "Validation found claim-level review issues before support could be accepted.",
          supports: [],
        });
      }
      return finalizeNeedsSourceClaim(
        target,
        rawClaim,
        claimDiagnostics,
        rawClaim.statusReason || "The bounded sources did not provide verifiable direct support for this claim.",
      );
    }

    if (claimDiagnostics.length > 0 || normalizedSupports.length !== rawClaim.supports.length) {
      return finalizeNeedsReviewClaim(target, rawClaim, claimDiagnostics, {
        statusReason: rawClaim.statusReason || "Validation could not preserve this as a strictly supported claim.",
        supports: normalizedSupports,
      });
    }

    return {
      claimKey: target.claimKey,
      fieldPath: target.fieldPath,
      claimText: target.claimText,
      status: "supported",
      originalStatus: rawClaim.status,
      statusReason: rawClaim.statusReason || "",
      referenceIds: referenceIdsFromValidatedSupports(normalizedSupports),
      supports: sortValidatedSupports(normalizedSupports),
      diagnostics: claimDiagnostics,
    };
  }

  return finalizeNeedsReviewClaim(target, rawClaim, claimDiagnostics, {
    statusReason: rawClaim.statusReason || "The bounded sources may be suggestive, but direct support still requires review.",
    supports: normalizedSupports,
  });
}

function claimSignature(rawClaim) {
  return JSON.stringify([
    rawClaim.claimKey,
    rawClaim.fieldPath,
    rawClaim.claimText,
    rawClaim.status,
    rawClaim.statusReason,
    (rawClaim.supports ?? []).map((support) => [
      support.sourceId,
      support.sourceName,
      support.referenceId,
      support.supportingQuote,
      support.rationale,
    ]),
  ]);
}

export class FormalCitationContractError extends Error {
  constructor(message, { code, details = null, sectionKey = null, rawContent = null } = {}) {
    super(message);
    this.name = "FormalCitationContractError";
    this.code = code;
    this.details = details;
    this.sectionKey = sectionKey;
    this.rawContent = rawContent;
  }
}

export function buildFormalCitationSectionResponseContract(sectionKey) {
  return {
    schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
    sectionKey,
    summary: "One short sentence.",
    claims: [
      {
        claimKey: "<exact target claimKey>",
        fieldPath: "<exact target fieldPath>",
        claimText: "<exact target claimText>",
        status: "supported | needs_review | needs_source",
        statusReason: "<brief reason for review/source gaps, or empty string when fully supported>",
        supports: [
          {
            sourceId: "<bounded compiled source id>",
            sourceName: "<matching compiled source displayName>",
            referenceId: "<allowed reference id>",
            supportingQuote: "<exact verbatim quote>",
            rationale: "<brief support explanation>",
          },
        ],
      },
    ],
    notes: ["optional short notes"],
  };
}

export function parseFormalCitationSectionResponse({
  payload,
  rawContent = null,
  sectionKey,
  targets,
  article,
  articleSources,
  sourcePacket,
}) {
  const normalizedSectionKey = normalizeFormalCitationSectionKey(sectionKey);
  if (!normalizedSectionKey) {
    throw new FormalCitationContractError(`Unknown formal citation section: ${sectionKey}`, {
      code: "unknown_section",
      rawContent,
      sectionKey,
    });
  }

  const normalizedPayload = coerceSectionPayload(payload);
  let parsed;
  try {
    parsed = rawSectionPayloadSchema.parse(normalizedPayload);
    parsed.claims = parsed.claims.map(coerceRawClaim);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new FormalCitationContractError(
        `Formal citation section response schema error: ${formatZodIssues(error)}`,
        {
          code: "schema_error",
          details: error.issues,
          rawContent,
          sectionKey: normalizedSectionKey,
        },
      );
    }
    throw error;
  }

  const responseSectionKey = normalizeFormalCitationSectionKey(parsed.sectionKey);
  if (responseSectionKey !== normalizedSectionKey) {
    throw new FormalCitationContractError(
      `Formal citation response section mismatch: expected ${normalizedSectionKey}, received ${parsed.sectionKey}.`,
      {
        code: "section_mismatch",
        rawContent,
        sectionKey: normalizedSectionKey,
      },
    );
  }

  const sourcesById = buildSourceCatalog({ sourcePacket, articleSources });
  const sourcesByName = buildSourceNameIndex(sourcesById);
  const referencesById = buildReferenceCatalog(article, sourcePacket);
  const targetsByKey = new Map(targets.map((target) => [target.claimKey, target]));
  const rawClaimsByKey = new Map();
  const diagnostics = [];

  for (const rawClaim of parsed.claims) {
    if (!targetsByKey.has(rawClaim.claimKey)) {
      diagnostics.push(diagnostic(
        "unknown_claim_key",
        `claimKey "${rawClaim.claimKey}" is not present in the requested section targets.`,
        { claimKey: rawClaim.claimKey },
      ));
      continue;
    }

    const bucket = rawClaimsByKey.get(rawClaim.claimKey) ?? [];
    bucket.push(rawClaim);
    rawClaimsByKey.set(rawClaim.claimKey, bucket);
  }

  const claims = [];
  for (const target of targets) {
    const rawClaims = rawClaimsByKey.get(target.claimKey) ?? [];

    if (rawClaims.length === 0) {
      const missingDiagnostic = diagnostic(
        "missing_claim",
        "The model omitted this required target from the section response.",
        { claimKey: target.claimKey },
      );
      diagnostics.push(missingDiagnostic);
      claims.push(finalizeNeedsSourceClaim(
        target,
        null,
        [missingDiagnostic],
        "The model omitted this target from its section response.",
      ));
      continue;
    }

    if (rawClaims.length > 1) {
      const signatures = new Set(rawClaims.map(claimSignature));
      const duplicateDiagnostic = diagnostic(
        signatures.size === 1 ? "duplicate_claim" : "conflicting_claim",
        signatures.size === 1
          ? "The model emitted the same target more than once; one copy was kept."
          : "The model emitted conflicting decisions for the same target.",
        { claimKey: target.claimKey },
      );
      diagnostics.push(duplicateDiagnostic);

      if (signatures.size > 1) {
        claims.push(finalizeNeedsReviewClaim(target, rawClaims[0], [duplicateDiagnostic]));
        continue;
      }

      const validatedDuplicate = validateRawClaimForTarget({
        rawClaim: rawClaims[0],
        target,
        sourcesById,
        sourcesByName,
        referencesById,
      });
      validatedDuplicate.diagnostics = [...validatedDuplicate.diagnostics, duplicateDiagnostic];
      claims.push(validatedDuplicate);
      continue;
    }

    claims.push(validateRawClaimForTarget({
      rawClaim: rawClaims[0],
      target,
      sourcesById,
      sourcesByName,
      referencesById,
    }));
  }

  const result = {
    schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
    sectionKey: normalizedSectionKey,
    summary: parsed.summary,
    notes: parsed.notes,
    claims,
    diagnostics,
    validationSummary: {
      targetCount: targets.length,
      emittedClaimCount: parsed.claims.length,
      diagnosticCount: diagnostics.length + claims.reduce((total, claim) => total + claim.diagnostics.length, 0),
      downgradedClaimCount: claims.filter((claim) => claim.originalStatus && claim.originalStatus !== claim.status).length,
    },
  };

  return assertValidatedFormalCitationSectionResult(result);
}

export function assertValidatedFormalCitationSectionResult(result) {
  try {
    return validatedSectionResultSchema.parse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new FormalCitationContractError(
        `Validated formal citation section result was invalid: ${formatZodIssues(error)}`,
        {
          code: "validated_result_error",
          details: error.issues,
          sectionKey: result?.sectionKey ?? null,
        },
      );
    }
    throw error;
  }
}
