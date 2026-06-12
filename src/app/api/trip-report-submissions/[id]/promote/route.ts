import { NextResponse } from "next/server";

import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import {
  getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError,
} from "@/features/reports/submissions/tripReportSubmissionStore.server";
import { TripReportSubmissionNotFoundError } from "@/features/reports/submissions/convexTripReportSubmissionStore";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

type PromoteRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

type PromoteBody = {
  publish?: unknown;
};

const MAX_PROMOTE_BODY_BYTES = 8 * 1024;

export async function POST(request: Request, context: PromoteRouteContext) {
  const rateLimited = await enforceRateLimit(request, "editorSmallWrite");
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const { id } = await Promise.resolve(context.params);
    const body = await readJsonBody<PromoteBody>(request, { maxBytes: MAX_PROMOTE_BODY_BYTES });
    const shouldPublish = asBoolean(body.publish);
    const store = await getTripReportSubmissionStore();

    if (!shouldPublish) {
      const result = await store.previewPromotion(id);
      return NextResponse.json({
        ok: true,
        published: false,
        submission: result.row,
        payload: result.payload,
      });
    }

    const result = await store.promote(id, {
      reviewer: auth.session.user.email,
      notes: "Published from accepted trip report submission.",
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

  console.error("Failed to promote trip report submission:", error);
  return NextResponse.json(
    { error: "Unable to promote trip report submission right now." },
    { status: 500 },
  );
}
