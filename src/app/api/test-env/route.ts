import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getServerDataWriteHealth } from "@server/data/serverWriteHealth";
import { getDiagnosticsRuntimeConfig } from "@server/runtime/envContract";
import { createDiagnosticsDisclosureView } from "@server/runtime/diagnosticsDisclosurePolicy";

export const runtime = "nodejs";

// Presence-only diagnostics for the secrets sign-in and editor writes need.
// Member passwords live hashed in Postgres, not in env.
const DIAGNOSTIC_KEYS = ["AUTH_SECRET", "DATA_ADMIN_KEY"];

function hasConfiguredValue(key: string): boolean {
  const value = process.env[key];
  return typeof value === "string" && value.length > 0;
}

const testEnvOperation = protectedRouteOperation({
  auth: "editor",
  rateLimit: "editorHeavyWrite",
  unexpectedErrorLabel: "Failed to load test env diagnostics:",
  unexpectedErrorMessage: "Unable to load test env diagnostics right now.",
  operation: () => {
    const diagnosticsConfig = getDiagnosticsRuntimeConfig();
    const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
    const dataHealth = getServerDataWriteHealth();

    const view = createDiagnosticsDisclosureView("editor", {
      now: new Date(),
      production,
      testEnvRouteEnabledInProduction: diagnosticsConfig.testEnvRouteEnabledInProduction,
      keyPresence: DIAGNOSTIC_KEYS.map((name) => ({
        name,
        configured: hasConfiguredValue(name),
        sensitive: true,
      })),
      dataWriteHealth: dataHealth,
    });

    return NextResponse.json({
      ...view,
      dataIssues: view.issues,
    });
  },
});

export async function POST(request: Request) {
  const diagnosticsConfig = getDiagnosticsRuntimeConfig();
  const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (production && !diagnosticsConfig.testEnvRouteEnabledInProduction) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return testEnvOperation(request);
}
