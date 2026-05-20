import { NextResponse } from "next/server";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getServerConvexWriteHealth } from "@server/convex/serverWriteHealth";
import { getDiagnosticsRuntimeConfig, runRuntimeEnvPreflight } from "@server/runtime/envContract";
import { createDiagnosticsDisclosureView } from "@server/runtime/diagnosticsDisclosurePolicy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "diagnosticRead");
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  const convexHealth = getServerConvexWriteHealth();
  const runtimeEnv = runRuntimeEnvPreflight();
  const diagnosticsConfig = getDiagnosticsRuntimeConfig();
  const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  return NextResponse.json(
    createDiagnosticsDisclosureView("editor", {
      now: new Date(),
      production,
      testEnvRouteEnabledInProduction: diagnosticsConfig.testEnvRouteEnabledInProduction,
      convexWriteHealth: convexHealth,
      runtimeEnv,
    }),
  );
}
