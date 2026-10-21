import { NextResponse } from "next/server";
import { getDiagnosticsRuntimeConfig } from "@server/runtime/envContract";

type TestEnvHandler = (request: Request) => Promise<NextResponse>;

export function testEnvRoute(handler: TestEnvHandler): TestEnvHandler {
  return async (request) => {
    const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
    if (production && !getDiagnosticsRuntimeConfig().testEnvRouteEnabledInProduction) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    return handler(request);
  };
}
