import { normalizeReagentLookupName } from "@/lib/reagentTesting";

type PublicEgressProxyErrorCode = | "invalid-input"
| "not-found"
| "timeout"
| "response-too-large"
| "invalid-content-type"
| "upstream-error"
| "network-error"

export type PublicEgressProxyResult =
  | { ok: true; data: unknown; cacheControl: string }
  | { ok: false; code: PublicEgressProxyErrorCode; status: number; message: string; cacheControl?: string };

type FetchLike = typeof fetch;

const PROTESTKIT_ORIGIN = "https://protestkit.eu";
const PROTESTKIT_API_PREFIX = "/api/v1/";
const MAX_SUBSTANCE_LENGTH = 100;
const UPSTREAM_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const SUCCESS_CACHE_CONTROL = "s-maxage=3600, stale-while-revalidate=86400";
const NEGATIVE_CACHE_CONTROL = "s-maxage=300, stale-while-revalidate=1800";

const ALLOWED_ORIGINS = new Set([
  "https://dose.wiki",
  "https://www.dose.wiki",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3217",
  "http://127.0.0.1:3217",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const negativeCache = new Map<string, { expiresAt: number; result: PublicEgressProxyResult }>();

export function resetPublicEgressPolicyForTests(): void {
  negativeCache.clear();
}

export function getPublicEgressCorsHeaders(request: Request): Headers {
  const headers = new Headers({
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  const origin = request.headers.get("origin");
  if (origin && isAllowedPublicEgressOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

export function isAllowedPublicEgressOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin);
}

export function parseProtestKitLookupInput(value: string | null): { ok: true; candidate: string } | { ok: false } {
  if (!value || value.length > MAX_SUBSTANCE_LENGTH) {
    return { ok: false };
  }

  const candidate = normalizeReagentLookupName(value);
  if (candidate.length === 0 || candidate.length > MAX_SUBSTANCE_LENGTH) {
    return { ok: false };
  }

  return { ok: true, candidate };
}


export function buildProtestKitUpstreamUrl(candidate: string): string {
  const url = new URL(PROTESTKIT_API_PREFIX + encodeURIComponent(candidate), PROTESTKIT_ORIGIN);
  if (url.origin !== PROTESTKIT_ORIGIN || !url.pathname.startsWith(PROTESTKIT_API_PREFIX)) {
    throw new Error("Invalid ProtestKit upstream target.");
  }

  return url.toString();
}

export async function fetchProtestKitPublicEgress(candidate: string, fetcher: FetchLike = fetch): Promise<PublicEgressProxyResult> {
  const cached = getNegativeCache(candidate);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetcher(buildProtestKitUpstreamUrl(candidate), {
      signal: controller.signal,
      headers: {
        "User-Agent": "dose.wiki/1.0 (harm-reduction-resource)",
        Accept: "application/json",
      },
    });

    if (!upstreamResponse.ok) {
      return cacheIfNegative(candidate, mapUpstreamStatus(upstreamResponse.status));
    }

    const contentType = upstreamResponse.headers.get("content-type") ?? "";
    if (!isJsonContentType(contentType)) {
      return {
        ok: false,
        code: "invalid-content-type",
        status: 502,
        message: "Invalid upstream API response",
      };
    }

    const bodyText = await readBoundedResponseText(upstreamResponse, MAX_RESPONSE_BYTES);
    return {
      ok: true,
      data: JSON.parse(bodyText),
      cacheControl: SUCCESS_CACHE_CONTROL,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, code: "timeout", status: 504, message: "Upstream API timeout", cacheControl: NEGATIVE_CACHE_CONTROL };
    }

    if (error instanceof ResponseTooLargeError) {
      return { ok: false, code: "response-too-large", status: 502, message: "Invalid upstream API response" };
    }

    if (error instanceof SyntaxError) {
      return { ok: false, code: "invalid-content-type", status: 502, message: "Invalid upstream API response" };
    }

    console.error("[public-egress] protestkit:request_failed", redactPublicEgressError(error));
    return { ok: false, code: "network-error", status: 502, message: "Failed to fetch from ProtestKit" };
  } finally {
    clearTimeout(timeout);
  }
}

export function redactPublicEgressError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.name === "AbortError" ? "request aborted" : "upstream request failed",
    };
  }

  return { name: "UnknownError", message: "upstream request failed" };
}

function mapUpstreamStatus(status: number): PublicEgressProxyResult {
  if (status === 404) {
    return { ok: false, code: "not-found", status: 404, message: "Substance not found", cacheControl: NEGATIVE_CACHE_CONTROL };
  }

  if (status === 408 || status === 504) {
    return { ok: false, code: "timeout", status: 504, message: "Upstream API timeout", cacheControl: NEGATIVE_CACHE_CONTROL };
  }

  return { ok: false, code: "upstream-error", status: 502, message: "Upstream API error", cacheControl: NEGATIVE_CACHE_CONTROL };
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError();
    }

    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

function cacheIfNegative(candidate: string, result: PublicEgressProxyResult): PublicEgressProxyResult {
  if (!result.ok && result.cacheControl) {
    negativeCache.set(candidate, {
      expiresAt: Date.now() + 5 * 60_000,
      result,
    });
  }

  return result;
}

function getNegativeCache(candidate: string): PublicEgressProxyResult | null {
  const cached = negativeCache.get(candidate);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    negativeCache.delete(candidate);
    return null;
  }

  return cached.result;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

class ResponseTooLargeError extends Error {
  constructor() {
    super("Upstream response exceeded public egress response limit.");
    this.name = "ResponseTooLargeError";
  }
}
