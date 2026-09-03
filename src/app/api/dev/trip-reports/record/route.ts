/**
 * Per-record write for the Trip Report Portal (`/dev` → Trip reports).
 *
 * One POST with a discriminated body rather than a `[id]` route, because the
 * shared `protectedRouteOperation` wrapper handles a bare `Request` and does not
 * thread Next's dynamic route params; `api/dev/replications/editorial` reaches
 * for the same shape for the same reason.
 *
 *   GET  ?id=…  → { report: { id, slug, fields } }
 *   POST { mode: "save",   id, expected, updates, profile_key?, confirm_author_name_claim? }
 *   POST { mode: "delete", id }   (admin only; refused here and again in Convex)
 *
 * The GET is the read half of the portal's split payload: `/api/dev/trip-reports`
 * returns an index projection with no report bodies in it, and this returns the
 * one body the editor pane actually opened.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { canApprove } from "@/lib/auth/roles";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  normalizeEditableFields,
  type TripReportEditableFields,
} from "../../../../../../convex/lib/tripReportEditing";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 256 * 1024;

type RecordBody = {
  mode?: unknown;
  id?: unknown;
  expected?: unknown;
  updates?: unknown;
  profile_key?: unknown;
  confirm_author_name_claim?: unknown;
};

type ParsedRecord =
  | {
      mode: "save";
      id: string;
      expected: TripReportEditableFields;
      updates: TripReportEditableFields;
      profileKey?: string;
      confirmAuthorNameClaim?: boolean;
    }
  | { mode: "delete"; id: string };

function requireId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new JsonBodyError(400, "id is required.");
  }

  return value.trim();
}

function requireFields(value: unknown, field: string): TripReportEditableFields {
  if (typeof value !== "object" || value === null) {
    throw new JsonBodyError(400, `${field} must be a report field set.`);
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.subject !== "object" || candidate.subject === null) {
    throw new JsonBodyError(400, `${field}.subject is required.`);
  }

  for (const key of ["substances", "onset", "peak", "offset", "tags"]) {
    if (!Array.isArray(candidate[key])) {
      throw new JsonBodyError(400, `${field}.${key} must be a list.`);
    }
  }

  // Normalizing here rather than in the browser is what makes the concurrency
  // check honest: the mutation compares against this same normalizer, so a
  // client that trims differently cannot manufacture a false conflict.
  return normalizeEditableFields(candidate as unknown as Parameters<typeof normalizeEditableFields>[0]);
}

function parseRecordBody(body: RecordBody): ParsedRecord {
  const id = requireId(body.id);
  const mode = body.mode;

  if (mode === "delete") {
    return { mode: "delete", id };
  }

  if (mode !== "save") {
    throw new JsonBodyError(400, 'mode must be "save" or "delete".');
  }

  const parsed: ParsedRecord = {
    mode: "save",
    id,
    expected: requireFields(body.expected, "expected"),
    updates: requireFields(body.updates, "updates"),
  };

  // Absent leaves the stored attribution alone; an empty string clears it. The
  // two are different instructions, so the key is only forwarded when present.
  if (typeof body.profile_key === "string") {
    parsed.profileKey = body.profile_key.trim();
  }

  if (body.confirm_author_name_claim === true) {
    parsed.confirmAuthorNameClaim = true;
  }

  return parsed;
}

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load a trip report via Next route:",
  unexpectedErrorMessage: "Unable to load that trip report right now.",
  mapError: (error) => {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("no longer exists")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return null;
  },
  operation: async ({ actorEmail, convexWrite, request }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id || id.trim().length === 0 || id.length > 200) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const apiKey = convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;
    const report = await convexWrite.client.query(api.tripReports.getPortalRecord, {
      apiKey,
      actorEmail,
      id: id.trim() as Id<"tripReports">,
    });

    return NextResponse.json({ ok: true, report });
  },
});

export const POST = protectedRouteOperation<RecordBody, ParsedRecord>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MAX_PAYLOAD_BYTES, parse: parseRecordBody },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to write a trip report via Next route:",
  unexpectedErrorMessage: "Unable to save that trip report right now.",
  mapError: (error) => {
    const message = error instanceof Error ? error.message : "";

    // The byline claim guard is an adjudication request, not a failure: the
    // portal re-offers the save with an explicit attribution decision. Same
    // 409 the promotion route uses for the same refusal.
    if (message.includes("matches contributor profile")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (message.includes("changed since it was opened")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (message.includes("no longer exists")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.includes("cannot be saved:") || message.includes("not found.")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return null;
  },
  operation: async ({ auth, actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey = convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    if (body.mode === "delete") {
      if (!canApprove(auth.role)) {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
      }
      const result = await convexWrite.client.mutation(api.tripReports.deleteById, {
        apiKey,
        actorEmail,
        id: body.id as Id<"tripReports">,
      });

      revalidatePath("/reports");
      return NextResponse.json({ ok: true, deleted: result.deleted });
    }

    const result = await convexWrite.client.mutation(api.tripReports.update, {
      apiKey,
      actorEmail,
      id: body.id as Id<"tripReports">,
      expected: body.expected,
      updates: body.updates,
      profileKey: body.profileKey,
      confirmAuthorNameClaim: body.confirmAuthorNameClaim,
    });

    // The published report and the index that lists it both went stale.
    revalidatePath("/reports");
    revalidatePath(`/reports/${result.slug}`);

    return NextResponse.json({ ok: true, slug: result.slug });
  },
});
