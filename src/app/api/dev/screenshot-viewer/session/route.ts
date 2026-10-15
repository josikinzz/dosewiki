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
