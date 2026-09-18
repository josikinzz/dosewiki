import { NextResponse } from "next/server";

import { requireRoleSession } from "@/lib/auth/requireEditorSession";
import { canApprove } from "@/lib/auth/roles";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import {
  getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError,
} from "@/features/reports/submissions/tripReportSubmissionStore.server";
import { TripReportSubmissionNotFoundError } from "@/features/reports/submissions/dataTripReportSubmissionStore";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

type PromoteRouteContext = {
  params: Promise<{ id: string }>;
};

type PromoteBody = {
  publish?: unknown;
  // Editor-assigned contributor attribution. Trusted because this route is
  // behind an editor session; submissions themselves never carry a key.
  profile_key?: unknown;
  // Editor acknowledgement that the submitted byline matches a real
  // contributor and is being published without granting that identity.
  confirm_author_name_claim?: unknown;
};

const MAX_PROMOTE_BODY_BYTES = 8 * 1024;

export async function POST(request: Request, context: PromoteRouteContext) {
  const rateLimited = await enforceRateLimit(request, "editorSmallWrite");
  if (rateLimited) {
    return rateLimited;
  }

  // Previewing the promotion payload is an editor read; publishing it is an
  // admin decision, checked once the body says which one this is.
  const auth = await requireRoleSession("editor");
  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const { id } = await Promise.resolve(context.params);
    const body = await readJsonBody<PromoteBody>(request, { maxBytes: MAX_PROMOTE_BODY_BYTES });
    const shouldPublish = asBoolean(body.publish);
    const profileKey = asTrimmedString(body.profile_key);
    const confirmAuthorNameClaim = asBoolean(body.confirm_author_name_claim);
    const store = await getTripReportSubmissionStore();

    if (!shouldPublish) {
      const result = await store.previewPromotion(id, {
        profileKey,
        confirmAuthorNameClaim,
        reviewer: auth.session.user.email,
        actorEmail: auth.session.user.email,
      });
      return NextResponse.json({
        ok: true,
        published: false,
        submission: result.row,
        payload: result.payload,
      });
    }

    if (!canApprove(auth.role)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const result = await store.promote(id, {
      reviewer: auth.session.user.email,
      actorEmail: auth.session.user.email,
      notes: "Published from accepted trip report submission.",
      profileKey,
      confirmAuthorNameClaim,
    });

    return NextResponse.json({
      ok: true,
      published: true,
      submission: result.submission,
      reportId: result.reportId,
      payload: result.payload,
    });
  } catch (error) {
    return mapPromoteRouteError(error);
  }
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

/**
 * Postgres prefixes a thrown mutation error with its own request framing and
 * appends a stack, so lift just the sentence the editor needs to act on.
 */
function extractAuthorNameClaimMessage(message: string): string {
  const start = message.indexOf('Author name "');
  if (start < 0) {
    return message;
  }

  const tail = message.slice(start);
  const end = tail.indexOf("\n");
  return (end < 0 ? tail : tail.slice(0, end)).trim();
}

function asTrimmedString(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function mapPromoteRouteError(error: unknown): NextResponse {
  if (error instanceof JsonBodyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof TripReportSubmissionNotFoundError) {
    return NextResponse.json({ error: "Trip report submission not found." }, { status: 404 });
  }

  if (error instanceof TripReportSubmissionStorageConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  if (error instanceof Error && error.message.startsWith("Only accepted submissions can")) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Postgres wraps thrown mutation errors, so match by substring rather than
  // exact equality.
  if (error instanceof Error && error.message.includes("Contributor profile \"")) {
    return NextResponse.json({ error: "Contributor profile not found." }, { status: 400 });
  }

  // Relayed verbatim: it names the colliding profile and the two ways out, and
  // the editor is the one who has to choose between them.
  if (error instanceof Error && error.message.includes("matches contributor profile")) {
    return NextResponse.json({ error: extractAuthorNameClaimMessage(error.message) }, { status: 409 });
  }

  console.error("Failed to promote trip report submission:", error);
  return NextResponse.json(
    { error: "Unable to promote trip report submission right now." },
    { status: 500 },
  );
}
