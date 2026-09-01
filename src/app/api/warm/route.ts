import { NextResponse } from "next/server";
import { getPublicSubstanceLookup } from "@server/convex/publicData";
import { PUBLIC_SITE } from "@server/next/publicSite";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  summarizeWarmResults,
  warmUrls,
} from "../../../../scripts/deploy/warm-public-routes.lib.mjs";
import {
  authorizeWarmRequest,
  parseWarmSearchParams,
  planWarmTargets,
} from "./warmPolicy";

/**
 * Cron-driven warmer for substance articles.
 *
 * Vercel's ISR page cache does not survive a deployment and this repo deploys
 * many times a day, so the `vercel.json` cron calls this route on a schedule
 * to request every substance article on the public origin
 * (`PUBLIC_SITE.url`, i.e. https://dose.wiki for the dose.wiki flavor) with
 * bounded concurrency. It deliberately targets the canonical public host
 * rather than the request host: crons arrive on the deployment URL, and the
 * editor hosts must never be the warmed surface.
 *
 * The run is time-boxed below the function's `maxDuration`, warms the most
 * important tiers first, and returns the same summary shape as
 * `scripts/deploy/warm-public-routes.mjs`, with `remaining` reporting how many
 * URLs the budget did not reach.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // The cron fires four times an hour; the limit only matters for a caller
  // guessing at the secret, whose failures should not be free to repeat.
  const rateLimited = await enforceRateLimit(request, "diagnosticRead");
  if (rateLimited) return rateLimited;

  const decision = authorizeWarmRequest(request.headers.get("authorization"), {
    CRON_SECRET: process.env.CRON_SECRET,
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status });
  }

  const startedAt = Date.now();
  const { concurrency, budgetMs, includeLow } = parseWarmSearchParams(
    new URL(request.url).searchParams,
  );
  const lookup = await getPublicSubstanceLookup();
  const targets = planWarmTargets(lookup, PUBLIC_SITE.url, { includeLow });

  const { results, remaining } = await warmUrls(targets, {
    concurrency,
    timeoutMs: 20_000,
    retries: 1,
    deadlineAt: startedAt + budgetMs,
    headers: { "user-agent": "dosewiki-warm/1.0 (+/api/warm)" },
  });

  const summary = summarizeWarmResults(results, {
    slowest: 10,
    totalMs: Date.now() - startedAt,
    remaining,
  });

  return NextResponse.json(
    {
      site: PUBLIC_SITE.url,
      planned: targets.length,
      concurrency,
      budgetMs,
      ...summary,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
