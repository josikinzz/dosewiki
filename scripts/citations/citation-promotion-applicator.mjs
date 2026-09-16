import { api } from "../../lib/postgres/runtime/api.ts"

const VALID_APPROVED_WRITE_MODES = new Set(["preserve", "refresh", "replace"]);

function normalizeApprovedWriteMode(mode = "preserve") {
  if (VALID_APPROVED_WRITE_MODES.has(mode)) {
    return mode;
  }
  throw new Error(`Unknown citation approved write mode: ${mode}`);
}

function dedupeStrings(values = []) {
  const seen = new Set();
  const deduped = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

export function buildCitationPromotionWritePayload({
  slug,
  article,
  evidence,
  approvedWriteMode = "preserve",
  staleClaimKeys = [],
}) {
  const normalizedSlug = typeof slug === "string" ? slug.trim() : "";
  if (!normalizedSlug) {
    throw new Error("Citation promotion write payload requires a slug.");
  }
  if (!article || typeof article !== "object" || Array.isArray(article)) {
    throw new Error("Citation promotion write payload requires an article object.");
  }
  if (!Array.isArray(evidence)) {
    throw new Error("Citation promotion write payload requires an evidence array.");
  }

  return {
    slug: normalizedSlug,
    article,
    evidence,
    approvedWriteMode: normalizeApprovedWriteMode(approvedWriteMode),
    staleClaimKeys: dedupeStrings(staleClaimKeys),
  };
}

export function buildCitationPromotionPlan({
  source,
  slug,
  title,
  article,
  evidence,
  changes = [],
  references = null,
  gaps = [],
  staleClaimKeys = [],
  approvedWriteMode = "preserve",
  summary = {},
}) {
  const writePayload = buildCitationPromotionWritePayload({
    slug,
    article,
    evidence,
    approvedWriteMode,
    staleClaimKeys,
  });

  return {
    kind: "citation-promotion-plan",
    source,
    slug: writePayload.slug,
    title,
    article,
    evidence,
    changes,
    references,
    gaps,
    staleClaimKeys: writePayload.staleClaimKeys,
    approvedWriteMode: writePayload.approvedWriteMode,
    summary: {
      evidenceRows: evidence.length,
      articleChanges: changes.length,
      staleClaimKeys: writePayload.staleClaimKeys.length,
      ...summary,
    },
    writePayload,
  };
}

export async function applyCitationPromotionPlan({ client, apiKey, plan }) {
  if (!client?.mutation) {
    throw new Error("Citation promotion applicator requires a native data client.");
  }
  if (!apiKey) {
    throw new Error("Citation promotion applicator requires an admin intent token.");
  }
  if (!plan?.writePayload) {
    throw new Error("Citation promotion applicator requires a promotion plan with a write payload.");
  }

  return await client.mutation(api.citationEvidence.applyDraft, {
    apiKey,
    ...plan.writePayload,
  });
}
