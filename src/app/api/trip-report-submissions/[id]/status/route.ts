import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import {
  getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError,
} from "@/features/reports/submissions/tripReportSubmissionStore.server";
import { TripReportSubmissionNotFoundError } from "@/features/reports/submissions/dataTripReportSubmissionStore";
import {
  decisionNoteOrUndefined,
  isTripReportSubmissionStatus,
  type TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissionStatus";

export const runtime = "nodejs";

type StatusRouteContext = {
  params: Promise<{ id: string }>;
};

type StatusBody = {
  status?: unknown;
  notes?: unknown;
  public_reason?: unknown;
};

const MAX_STATUS_BODY_BYTES = 16 * 1024;

export async function POST(request: Request, context: StatusRouteContext) {
  return protectedRouteOperation<StatusBody, {
    status: TripReportSubmissionStatus;
    notes?: string;
    publicReason?: string;
  }>({
    // Triage decisions move a submission through the queue; that is an admin call.
    auth: "admin",
    rateLimit: "editorSmallWrite",
    body: {
      maxBytes: MAX_STATUS_BODY_BYTES,
      parse: (body) => ({
        status: parseStatus(body.status),
        // A blank note records only the outcome and keeps the stored note.
        notes: decisionNoteOrUndefined(body.notes),
        // What the author reads in My reports; blank records none.
        publicReason: decisionNoteOrUndefined(body.public_reason),
      }),
    },
    unexpectedErrorLabel: "Failed to update trip report submission status:",
    // Total, so every failure keeps this route's own response shape.
    mapError: mapStatusRouteError,
    operation: async ({ actorEmail, body }) => {
      const { id } = await Promise.resolve(context.params);
      const store = await getTripReportSubmissionStore();
      const submission = await store.transition(id, {
        status: body.status,
        actorEmail,
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.publicReason !== undefined ? { publicReason: body.publicReason } : {}),
      });

      return NextResponse.json({ ok: true, submission });
    },
  })(request);
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
