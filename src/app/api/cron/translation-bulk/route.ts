/**
 * Durable operator-started corpus translation. The bulk lane holds its own
 * lease, separate from the one-record editorial refresh lane, and its model
 * batches share the bulk quota (90) of the 100-request ceiling, so both lanes
 * can run at once without exceeding it.
 */
import { NextResponse } from "next/server";

import { authorizeCronRequest, withCronWriteFreeze } from "@server/http/cronAuthorization";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { MAX_TRANSLATION_REQUEST_CONCURRENCY, TRANSLATION_REQUEST_QUOTA } from "@server/translation/requestPool";
import { runTranslationJobs } from "@server/translation/jobWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = withCronWriteFreeze(async function GET(request: Request) {
  const decision = authorizeCronRequest(request.headers.get("authorization"), {
    CRON_SECRET: process.env.CRON_SECRET,
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status });
  }
  getDataBackend();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing OPENROUTER_API_KEY on the server." }, { status: 503 });

  const run = await runTranslationJobs(apiKey, {
    mode: "bulk",
    jobsPerRun: MAX_TRANSLATION_REQUEST_CONCURRENCY,
    requestConcurrency: TRANSLATION_REQUEST_QUOTA.bulk,
  });
  return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
});
