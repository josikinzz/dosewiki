import { NextResponse } from "next/server";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getServerConvexWriteHealth } from "@server/convex/serverWriteHealth";
import { getDiagnosticsRuntimeConfig } from "@server/runtime/envContract";
import { createDiagnosticsDisclosureView } from "@server/runtime/diagnosticsDisclosurePolicy";

export const runtime = "nodejs";

const DIAGNOSTIC_KEYS = [
  "GITHUB_TOKEN",
  "ADMIN_PASSWORD",
  "CONVEX_ADMIN_KEY",
  "ZENBY",
  "KOSM",
  "COE",
  "JOSIE",
  "LYREA",
  "WITCHY",
  "ARCTIC",
];

function hasConfiguredValue(key: string): boolean {
  const value = process.env[key];
  return typeof value === "string" && value.length > 0;
}

export async function POST(request: Request) {
  const diagnosticsConfig = getDiagnosticsRuntimeConfig();
  const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (production && !diagnosticsConfig.testEnvRouteEnabledInProduction) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const rateLimited = await enforceRateLimit(request, "editorHeavyWrite");
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  const convexHealth = getServerConvexWriteHealth();

  const view = createDiagnosticsDisclosureView("editor", {
    now: new Date(),
    production,
    testEnvRouteEnabledInProduction: diagnosticsConfig.testEnvRouteEnabledInProduction,
    keyPresence: DIAGNOSTIC_KEYS.map((name) => ({
      name,
      configured: hasConfiguredValue(name),
      sensitive: true,
    })),
    convexWriteHealth: convexHealth,
  });

  return NextResponse.json({
    ...view,
    convexIssues: view.issues,
  });
}
