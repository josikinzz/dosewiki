import { NextResponse } from "next/server";

import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import {
  getPublicTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError,
} from "@/features/reports/submissions/tripReportSubmissionStore.server";
import { TripReportSubmissionValidationError } from "@/features/reports/submissions/dataTripReportSubmissionStore";
import type {
  TimelineEntryInput,
  TripReportSubmissionInput,
  TripReportSubmissionSubjectInput,
  TripReportSubmissionSubstanceInput,
} from "@/features/reports/submissions/tripReportSubmissions";
import { enforceRateLimit, getClientIp } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const MAX_SUBMISSION_PAYLOAD_BYTES = 128 * 1024;

type PublicSubmissionBody = {
  report?: unknown;
  contact_email?: unknown;
  may_contact?: unknown;
  publish_consent?: unknown;
  age_confirmed?: unknown;
  honeypot?: unknown;
  website?: unknown;
};

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicTripReportSubmit");
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const rawBody = await readJsonBody<PublicSubmissionBody>(request, {
      maxBytes: MAX_SUBMISSION_PAYLOAD_BYTES,
    });
    const body = parseSubmissionBody(rawBody, request);
    const store = await getPublicTripReportSubmissionStore();
    const result = await store.create(body);

    return NextResponse.json(
      {
        ok: true,
        id: result.row.id,
        status: "received",
        warnings: result.warnings,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof TripReportSubmissionValidationError) {
      return NextResponse.json(
        {
          error: "Submission validation failed.",
          errors: error.errors,
          warnings: error.warnings,
        },
        { status: 400 },
      );
    }

    if (error instanceof TripReportSubmissionStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("Failed to receive trip report submission:", error);
    return NextResponse.json(
      { error: "Unable to receive trip report submission right now." },
      { status: 500 },
    );
  }
}

function parseSubmissionBody(body: PublicSubmissionBody, request: Request): TripReportSubmissionInput {
  const report = asRecord(body.report);
  const subject = asRecord(report.subject);

  return {
    report: {
      title: asString(report.title),
      subject: parseSubject(subject),
      substances: asArray(report.substances).map(parseSubstance),
      introduction: asString(report.introduction),
      onset: asArray(report.onset).map(parseTimelineEntry),
      peak: asArray(report.peak).map(parseTimelineEntry),
      offset: asArray(report.offset).map(parseTimelineEntry),
      conclusion: asString(report.conclusion),
      tags: asArray(report.tags).map(asString),
    },
    contact_email: asString(body.contact_email),
    may_contact: asBoolean(body.may_contact),
    publish_consent: asBoolean(body.publish_consent),
    age_confirmed: asBoolean(body.age_confirmed),
    honeypot: asString(body.honeypot) || asString(body.website),
    ip: getClientIp(request),
    ip_hash_secret: process.env.TRIP_REPORT_SUBMISSIONS_IP_HASH_SECRET,
    user_agent: request.headers.get("user-agent") ?? undefined,
  };
}

function parseSubject(record: Record<string, unknown>): TripReportSubmissionSubjectInput {
  return {
    name: asString(record.name),
    // The three restricted fields are read only so the normalizer can report
    // that they were thrown away. This route is unauthenticated, so a submitted
    // contributor key is an unproven claim on someone else's profile, and a
    // submitted avatar or PDF URL would put a submitter-controlled remote image
    // and outbound link on a published page. None of them reach storage.
    profile_key: asString(record.profile_key),
    avatar_url: asString(record.avatar_url),
    trip_date: asString(record.trip_date),
    age: asString(record.age),
    gender: asString(record.gender),
    height: asString(record.height),
    weight: asString(record.weight),
    medications: asString(record.medications),
    setting: asString(record.setting),
    pdf_url: asString(record.pdf_url),
  };
}

function parseSubstance(value: unknown): TripReportSubmissionSubstanceInput {
  const record = asRecord(value);
  return {
    name: asString(record.name),
    dose: asString(record.dose),
    roa: asString(record.roa),
  };
}

function parseTimelineEntry(value: unknown): TimelineEntryInput {
  const record = asRecord(value);
  return {
    time: asString(record.time),
    description: asString(record.description),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}
