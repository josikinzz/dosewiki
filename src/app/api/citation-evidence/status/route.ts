import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  isCitationEvidenceStatus,
  type CitationEvidenceStatus,
} from "@/features/dev/tools/citation-review/citationReviewModels";

export const runtime = "nodejs";

const MAX_STATUS_PAYLOAD_BYTES = 128 * 1024;
const MAX_STATUS_REASON_LENGTH = 500;

type CitationEvidenceStatusBody = {
  slug?: unknown;
  claimKey?: unknown;
  claimKeys?: unknown;
  status?: unknown;
  statusReason?: unknown;
};

type CitationEvidenceStatusInput = {
  slug: string;
  claimKeys: string[];
  status: CitationEvidenceStatus;
  statusReason?: string;
};

function normalizeClaimKeys(body: CitationEvidenceStatusBody): string[] {
  const claimKeys = Array.isArray(body.claimKeys)
    ? body.claimKeys
    : typeof body.claimKey === "string"
      ? [body.claimKey]
      : [];

  return [...new Set(
    claimKeys
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean),
  )];
}

function parseBody(body: CitationEvidenceStatusBody): CitationEvidenceStatusInput {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    throw new JsonBodyError(400, "Slug is required.");
  }

  const claimKeys = normalizeClaimKeys(body);
  if (claimKeys.length === 0) {
    throw new JsonBodyError(400, "At least one claim key is required.");
  }

  const status = typeof body.status === "string" ? body.status.trim() : "";
  // Decisions write approved or rejected; undo writes whatever the row held
  // before, which can be any evidence status.
  if (!isCitationEvidenceStatus(status)) {
    throw new JsonBodyError(400, "Review status must be an evidence status.");
  }

  const rawReason = body.statusReason;
  if (rawReason !== undefined && typeof rawReason !== "string") {
    throw new JsonBodyError(400, "Status reason must be text.");
  }
  const statusReason = typeof rawReason === "string" ? rawReason.trim() || undefined : undefined;
  if (statusReason && statusReason.length > MAX_STATUS_REASON_LENGTH) {
    throw new JsonBodyError(400, `Status reason must be ${MAX_STATUS_REASON_LENGTH} characters or fewer.`);
  }

  return {
    slug,
    claimKeys,
    status,
    statusReason,
  };
}

export const POST = protectedRouteOperation<CitationEvidenceStatusBody, CitationEvidenceStatusInput>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: MAX_STATUS_PAYLOAD_BYTES,
    parse: parseBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to update citation review status via Next route:",
  unexpectedErrorMessage: "Unable to update citation review status right now.",
  mapError: (error) => {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return null;
  },
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      dataWrite.adminKey;
    const result = await dataWrite.client.mutation(api.citationEvidence.setManyStatus, {
      apiKey,
      actorEmail,
      slug: body.slug,
      claimKeys: body.claimKeys,
      status: body.status,
      statusReason: body.statusReason,
    });

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      updatedBy: actorEmail,
    });
  },
});
