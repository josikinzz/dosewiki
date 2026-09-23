import { NextResponse } from "next/server";

/**
 * The one same-site rule for cookie-bearing routes. `Origin` and
 * `Sec-Fetch-Site` are browser-controlled; forwarded host headers are never
 * trusted to turn a foreign origin into an allowed request.
 *
 * - `editorWrite` and `publicWrite`: a mutation must name this origin, and a
 *   present `Sec-Fetch-Site` must be `same-origin`.
 * - `editorRead`: browsers omit `Origin` on same-origin GETs, so only a foreign
 *   `Origin` or a cross-site `Sec-Fetch-Site` is refused; direct navigation
 *   (`none`) is allowed.
 */
export type OriginPosture = "editorWrite" | "editorRead" | "publicWrite";

const REFUSALS: Record<OriginPosture, { error: string; code?: string }> = {
  editorWrite: { error: "This change must be sent from the same site. Reload the editor and try again.", code: "ORIGIN_REQUIRED" },
  editorRead: { error: "Editor data is only served to the editor itself.", code: "ORIGIN_REQUIRED" },
  publicWrite: { error: "Send feedback from this site." },
};

function isForeign(request: Request, posture: OriginPosture): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const ownOrigin = new URL(request.url).origin;
  if (posture === "editorRead") {
    return (origin !== null && origin !== ownOrigin)
      || (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none");
  }
  return origin !== ownOrigin || (fetchSite !== null && fetchSite !== "same-origin");
}

/** A 403 for a request from another site, or null when the request may proceed. */
export function foreignOriginResponse(request: Request, posture: OriginPosture): NextResponse | null {
  if (!isForeign(request, posture)) return null;
  const response = NextResponse.json(REFUSALS[posture], { status: 403 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
