/**
 * Per-record write for the Trip Report Portal (`/dev` → Trip reports).
 *
 * One POST with a discriminated body rather than a `[id]` route, because the
 * shared `protectedRouteOperation` wrapper handles a bare `Request` and does not
 * thread Next's dynamic route params; `api/dev/replications/editorial` reaches
 * for the same shape for the same reason.
 *
 *   GET  ?id=…  → { report: { id, slug, ownerEmail, fields, revision } }
 *   POST { mode: "save", id, expected, expectedRevision, updates, profile_key?, confirm_author_name_claim? }
 *   POST { mode: "delete", id }   (admin only; refused here and again in Postgres)
 *
 * The GET is the read half of the portal's split payload: `/api/dev/trip-reports`
 * returns an index projection with no report bodies in it, and this returns the
 * one body the editor pane actually opened.
 *
 * Contributor floor: My reports (`/dev/my-reports`) reads and saves through the
 * same two handlers. Postgres decides per row: an editor reads any report but,
 * like a contributor, saves only one whose `owner_email` is theirs
 * (`NOT_OWNER` otherwise) and only its content fields; an admin saves any
 * report with the full form.
 */
import { NextResponse } from "next/server";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { api } from "@server/postgres/runtime/api";
import type { Id } from "@server/postgres/runtime/dataModel";
import { canApprove } from "@/lib/auth/roles";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  normalizeEditableFields,
  type TripReportEditableFields,
} from "../../../../../../server/lib/tripReportEditing";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 256 * 1024;

type RecordBody = {
  mode?: unknown;
  id?: unknown;
  expected?: unknown;
  expectedRevision?: unknown;
  updates?: unknown;
  profile_key?: unknown;
  confirm_author_name_claim?: unknown;
  operationId?: unknown;
};

type ParsedRecord =
  | {
      mode: "save";
      id: string;
      expected: TripReportEditableFields;
      expectedRevision: string;
      updates: TripReportEditableFields;
      profileKey?: string;
      confirmAuthorNameClaim?: boolean;
      operationId?: string;
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
  if (typeof body.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedRevision)) {
    throw new JsonBodyError(400, "The published report revision is required. Reload the report before saving.");
  }

  const parsed: ParsedRecord = {
    mode: "save",
    id,
    expected: requireFields(body.expected, "expected"),
    expectedRevision: body.expectedRevision,
    updates: requireFields(body.updates, "updates"),
  };
  if (body.operationId !== undefined) {
    if (typeof body.operationId !== "string" || !/^[\w-]{16,100}$/.test(body.operationId)) throw new JsonBodyError(400, "A valid publication operation ID is required.");
    parsed.operationId = body.operationId;
  }

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
  auth: "contributor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load a trip report via Next route:",
  unexpectedErrorMessage: "Unable to load that trip report right now.",
  mapError: (error) => {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("no longer exists")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return null;
  },
  operation: async ({ actorEmail, dataWrite, request }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const slug = params.get("slug");
    if ((!id && !slug) || (id ?? slug ?? "").length > 200) {
      return NextResponse.json({ error: "A report id or slug is required." }, { status: 400 });
    }

    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const report = await dataWrite.client.query(api.tripReports.getPortalRecord, {
      apiKey,
      actorEmail,
      ...(id ? { id: id.trim() as Id<"tripReports"> } : { slug: slug!.trim() }),
      contextual: params.get("contextual") === "true",
    });

    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "private, no-store" } });
  },
});

export const POST = protectedRouteOperation<RecordBody, ParsedRecord>({
  auth: "contributor",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MAX_PAYLOAD_BYTES, parse: parseRecordBody },
  capabilities: [{ type: "dataWrite" }],
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
  operation: async ({ auth, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    if (body.mode === "delete") {
      if (!canApprove(auth.role)) {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
      }
      const result = await dataWrite.client.mutation(api.tripReports.deleteById, {
        apiKey,
        actorEmail,
        id: body.id as Id<"tripReports">,
      });

      // The deleted row leaves no slug behind, so only the index it dropped
      // out of can be named.
      await publishPublicCache({ targets: [{ kind: "report-lists" }], source: "manual" });
      return NextResponse.json({ ok: true, deleted: result.deleted });
    }

    const result = await dataWrite.client.mutation(api.tripReports.update, {
      apiKey,
      actorEmail,
      id: body.id as Id<"tripReports">,
      expected: body.expected,
      expectedRevision: body.expectedRevision,
      updates: body.updates,
      profileKey: body.profileKey,
      confirmAuthorNameClaim: body.confirmAuthorNameClaim,
      operationId: body.operationId,
    });

    // The published report and the index that lists it both went stale.
    await publishPublicCache({
      targets: [{ kind: "report", slug: result.slug }, { kind: "report-lists" }],
      source: "manual",
    });

    return NextResponse.json({ ok: true, slug: result.slug, fields: result.fields, revision: result.revision });
  },
});
