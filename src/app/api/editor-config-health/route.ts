import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getServerConvexWriteHealth } from "@server/convex/serverWriteHealth";
import { getDiagnosticsRuntimeConfig, runRuntimeEnvPreflight } from "@server/runtime/envContract";
import { createDiagnosticsDisclosureView } from "@server/runtime/diagnosticsDisclosurePolicy";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to load editor config health:",
  unexpectedErrorMessage: "Unable to load editor config health right now.",
  operation: () => {
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
  },
});
