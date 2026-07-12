import { enforceRateLimit } from "@server/http/nextRateLimit";

const MAX_REPORT_BYTES = 16_384;
const REPORT_WINDOW_MS = 60_000;
const REPORTS_PER_WINDOW = 60;

type CspReport = Record<string, unknown>;

function safeDirective(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,79}$/i.test(value)) {
    return undefined;
  }

  return value;
}

function safeOrigin(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (["inline", "eval", "self"].includes(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    return url.origin === "null" ? `${url.protocol}` : url.origin;
  } catch {
    return undefined;
  }
}

function getLegacyReport(payload: unknown): CspReport | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const report = (payload as Record<string, unknown>)["csp-report"];
  return report && typeof report === "object" && !Array.isArray(report)
    ? (report as CspReport)
    : null;
}

export async function POST(request: Request): Promise<Response> {
  const rateLimited = await enforceRateLimit(request, {
    keySuffix: "csp-observation",
    max: REPORTS_PER_WINDOW,
    windowMs: REPORT_WINDOW_MS,
  });
  if (rateLimited) {
    return rateLimited;
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/csp-report" && contentType !== "application/json") {
    return new Response(null, { status: 415 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }

  const report = getLegacyReport(payload);
  if (!report) {
    return new Response(null, { status: 400 });
  }

  console.info("[csp-observation]", {
    blockedOrigin: safeOrigin(report["blocked-uri"]),
    directive: safeDirective(report["effective-directive"] ?? report["violated-directive"]),
    documentOrigin: safeOrigin(report["document-uri"]),
  });

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
