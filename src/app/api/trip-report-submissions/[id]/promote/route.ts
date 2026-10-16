import { NextResponse } from "next/server";

import { canApprove } from "@/lib/auth/roles";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import {
  getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError,
} from "@/features/reports/submissions/tripReportSubmissionStore.server";
import { TripReportSubmissionNotFoundError } from "@/features/reports/submissions/dataTripReportSubmissionStore";

export const runtime = "nodejs";

type PromoteRouteContext = {
  params: Promise<{ id: string }>;
};

type PromoteBody = {
  publish?: unknown;
  profile_key?: unknown;
  confirm_author_name_claim?: unknown;
};

const MAX_PROMOTE_BODY_BYTES = 8 * 1024;

type ParsedPromoteBody = {
  shouldPublish: boolean;
  profileKey: string | undefined;
  confirmAuthorNameClaim: boolean;
};

export async function POST(request: Request, context: PromoteRouteContext) {
  return protectedRouteOperation<PromoteBody, ParsedPromoteBody>({
    auth: "editor",
    rateLimit: "editorSmallWrite",
    body: {
      maxBytes: MAX_PROMOTE_BODY_BYTES,
      parse: (body) => ({
        shouldPublish: asBoolean(body.publish),
        profileKey: asTrimmedString(body.profile_key),
        confirmAuthorNameClaim: asBoolean(body.confirm_author_name_claim),
      }),
    },
    unexpectedErrorLabel: "Failed to promote trip report submission:",
    mapError: mapPromoteRouteError,
    operation: async ({ auth, actorEmail, body }) => {
      const { id } = await Promise.resolve(context.params);
      const { shouldPublish, profileKey, confirmAuthorNameClaim } = body;
      const store = await getTripReportSubmissionStore();

      if (!shouldPublish) {
        const result = await store.previewPromotion(id, {
          profileKey,
          confirmAuthorNameClaim,
          actorEmail,
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
        actorEmail,
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
        suggestedOwner: result.suggestedOwner ?? null,
      });
    },
  })(request);
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

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

  if (error instanceof Error && error.message.includes("Contributor profile \"")) {
    return NextResponse.json({ error: "Contributor profile not found." }, { status: 400 });
  }

  if (error instanceof Error && error.message.includes("matches contributor profile")) {
    return NextResponse.json({ error: extractAuthorNameClaimMessage(error.message) }, { status: 409 });
  }

  console.error("Failed to promote trip report submission:", error);
  return NextResponse.json(
    { error: "Unable to promote trip report submission right now." },
    { status: 500 },
  );
}
