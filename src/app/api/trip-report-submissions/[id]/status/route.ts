import { NextResponse } from "next/server";

import { requireRoleSession } from "@/lib/auth/requireEditorSession";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import {
  getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError,
} from "@/features/reports/submissions/tripReportSubmissionStore.server";
import { TripReportSubmissionNotFoundError } from "@/features/reports/submissions/dataTripReportSubmissionStore";
import {
  isTripReportSubmissionStatus,
  type TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

type StatusRouteContext = {
  params: Promise<{ id: string }>;
};

type StatusBody = {
  status?: unknown;
  notes?: unknown;
};

const MAX_STATUS_BODY_BYTES = 16 * 1024;

export async function POST(request: Request, context: StatusRouteContext) {
  const rateLimited = await enforceRateLimit(request, "editorSmallWrite");
  if (rateLimited) {
    return rateLimited;
  }

  // Triage decisions move a submission through the queue; that is an admin call.
  const auth = await requireRoleSession("admin");
  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const { id } = await Promise.resolve(context.params);
    const body = await readJsonBody<StatusBody>(request, { maxBytes: MAX_STATUS_BODY_BYTES });
    const status = parseStatus(body.status);
    const notes = typeof body.notes === "string" ? body.notes : undefined;
    const store = await getTripReportSubmissionStore();
    const submission = await store.transition(id, {
      status,
      reviewer: auth.session.user.email,
      actorEmail: auth.session.user.email,
      notes,
    });

    return NextResponse.json({ ok: true, submission });
  } catch (error) {
    return mapStatusRouteError(error);
  }
}

function parseStatus(value: unknown): TripReportSubmissionStatus {
  if (!isTripReportSubmissionStatus(value)) {
    throw new JsonBodyError(400, "A valid submission status is required.");
  }

  return value;
}

function mapStatusRouteError(error: unknown): NextResponse {
  if (error instanceof JsonBodyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof TripReportSubmissionNotFoundError) {
    return NextResponse.json({ error: "Trip report submission not found." }, { status: 404 });
  }

  if (error instanceof TripReportSubmissionStorageConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  if (error instanceof Error && error.message.startsWith("Illegal transition:")) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error("Failed to update trip report submission status:", error);
  return NextResponse.json(
    { error: "Unable to update trip report submission right now." },
    { status: 500 },
  );
}
