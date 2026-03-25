import { NextResponse } from "next/server";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getServerConvexWriteHealth } from "@server/convex/serverWriteHealth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, { windowMs: 60_000, max: 30 });
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  const convexHealth = getServerConvexWriteHealth();

  return NextResponse.json({
    ok: true,
    canSaveToConvex: convexHealth.canSaveToConvex,
    convexAdminKeyConfigured: convexHealth.adminKeyConfigured,
    convexUrlConfigured: convexHealth.convexUrlConfigured,
    issues: convexHealth.issues,
    checkedAt: new Date().toISOString(),
  });
}
