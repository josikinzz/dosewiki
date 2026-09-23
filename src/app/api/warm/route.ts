import { NextResponse } from "next/server";
import { getPublicSubstanceLookup } from "@server/data/publicData";
import { PUBLIC_SITE } from "@server/next/publicSite";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { cronRoute } from "@server/http/cronAuthorization";
import {
  summarizeWarmResults,
  warmUrls,
} from "../../../../scripts/deploy/warm-public-routes.lib.mjs";
import {
  parseWarmSearchParams,
  planWarmTargets,
  warmRotationForTick,
} from "./warmPolicy";

/**
 * Cron-driven warmer for substance articles.
 *
 * Scheduled runs warm at most 40 high-priority article URLs on the canonical
 * public origin. Priority is an existing editorial signal, not inferred traffic.
 * Low-tier pages stay demand-driven instead of being swept every 15 minutes.
 *
 * Authenticated deployment warming may explicitly request includeLow=1 and
 * rotate through at most 120 URLs per bounded run. The workstation CLI remains
 * available for deliberate sitemap warming after a deployment.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = cronRoute(async function GET(request: Request) {
  const startedAt = Date.now();
  const { concurrency, budgetMs, includeLow, rotate, maxUrls } = parseWarmSearchParams(
    new URL(request.url).searchParams,
  );
  const rotateBy = rotate ?? warmRotationForTick(startedAt);
  const lookup = await getPublicSubstanceLookup();
  const targets = planWarmTargets(lookup, PUBLIC_SITE.url, {
    includeLow,
    rotateBy,
    highOnly: !includeLow,
    maxUrls,
  });

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
      includeLow,
      maxUrls,
      rotateBy,
      ...summary,
    },
    { headers: { "cache-control": "no-store" } },
  );
}, {
  // Keep unauthenticated attempts bounded as well as the authorized workload.
  rateLimit: (request) => enforceRateLimit(request, "diagnosticRead"),
});
