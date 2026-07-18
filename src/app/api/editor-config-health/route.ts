import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  getServerConvexWriteHealth,
  probeServerConvexAdminCredential,
} from "@server/convex/serverWriteHealth";
import { getDiagnosticsRuntimeConfig, runRuntimeEnvPreflight } from "@server/runtime/envContract";
import { createDiagnosticsDisclosureView } from "@server/runtime/diagnosticsDisclosurePolicy";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to load editor config health:",
  unexpectedErrorMessage: "Unable to load editor config health right now.",
  operation: async ({ actorEmail }) => {
    const configuredConvexHealth = getServerConvexWriteHealth();
    let convexHealth = configuredConvexHealth;

    if (configuredConvexHealth.canSaveToConvex) {
      try {
        await probeServerConvexAdminCredential(actorEmail);
      } catch (error) {
        console.error("Editor Convex credential probe failed:", error);
        convexHealth = {
          ...configuredConvexHealth,
          canSaveToConvex: false,
          issues: [
            ...configuredConvexHealth.issues,
            "Convex admin credential probe failed against the configured deployment.",
          ],
        };
      }
    }

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
