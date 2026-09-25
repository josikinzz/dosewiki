/**
 * GET /api/dev/screenshot-viewer/session: the local screenshot viewer's
 * presentation-only session, read by the `/dev` client `SessionProvider` in
 * place of the Auth.js endpoint. Answers 404 unless the viewer gate is open
 * (`next dev`, `DEV_SCREENSHOT_VIEWER=1`, write freeze, loopback host). It sets
 * no cookie and grants nothing: every other route authorizes from Auth.js.
 */
import { NextResponse } from "next/server";
import {
  buildDevScreenshotViewerSession,
  isDevScreenshotViewerEnabled,
  isLoopbackRequest,
} from "@server/auth/devScreenshotViewer";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "diagnosticRead");
  if (limited) return limited;
  if (!isDevScreenshotViewerEnabled() || !isLoopbackRequest(request.headers)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(buildDevScreenshotViewerSession(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
