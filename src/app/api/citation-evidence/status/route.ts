import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const MAX_STATUS_PAYLOAD_BYTES = 128 * 1024;
const REVIEW_STATUSES = new Set(["approved", "rejected"]);

type CitationEvidenceStatusBody = {
  slug?: unknown;
  claimKey?: unknown;
  claimKeys?: unknown;
  status?: unknown;
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

function parseBody(body: CitationEvidenceStatusBody) {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    throw new JsonBodyError(400, "Slug is required.");
  }

  const claimKeys = normalizeClaimKeys(body);
  if (claimKeys.length === 0) {
    throw new JsonBodyError(400, "At least one claim key is required.");
  }

  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!REVIEW_STATUSES.has(status)) {
    throw new JsonBodyError(400, "Review status must be approved or rejected.");
  }

  return {
    slug,
    claimKeys,
    status: status as "approved" | "rejected",
  };
}

export const POST = protectedRouteOperation<
  CitationEvidenceStatusBody,
  { slug: string; claimKeys: string[]; status: "approved" | "rejected" }
>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: MAX_STATUS_PAYLOAD_BYTES,
    parse: parseBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to update citation review status via Next route:",
  unexpectedErrorMessage: "Unable to update citation review status right now.",
  mapError: (error) => {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return null;
  },
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      convexWrite.adminKey;
    const result = await convexWrite.client.mutation(api.citationEvidence.setManyStatus, {
      apiKey,
      actorEmail,
      slug: body.slug,
      claimKeys: body.claimKeys,
      status: body.status,
    });

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      updatedBy: actorEmail,
    });
  },
});
