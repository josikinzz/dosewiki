import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  getServerDataWriteHealth,
  probeServerDataAdminCredential,
} from "@server/data/serverWriteHealth";
import { getDiagnosticsRuntimeConfig, runRuntimeEnvPreflight } from "@server/runtime/envContract";
import { createDiagnosticsDisclosureView } from "@server/runtime/diagnosticsDisclosurePolicy";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to load editor config health:",
  unexpectedErrorMessage: "Unable to load editor config health right now.",
  operation: async ({ actorEmail }) => {
    const configuredDataHealth = getServerDataWriteHealth();
    let dataHealth = configuredDataHealth;

    if (configuredDataHealth.canSaveToPostgres) {
      try {
        await probeServerDataAdminCredential(actorEmail);
      } catch (error) {
        console.error("Editor Postgres credential probe failed:", error);
        dataHealth = {
          ...configuredDataHealth,
          canSaveToPostgres: false,
          issues: [
            ...configuredDataHealth.issues,
            "Postgres admin credential probe failed against the configured deployment.",
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
        dataWriteHealth: dataHealth,
        runtimeEnv,
      }),
    );
  },
});
