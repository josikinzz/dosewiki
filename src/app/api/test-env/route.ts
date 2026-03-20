import { NextResponse } from "next/server";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const ENABLED_IN_PRODUCTION = process.env.ENABLE_TEST_ENV === "true";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !ENABLED_IN_PRODUCTION) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const rateLimited = await enforceRateLimit(request, { windowMs: 60_000, max: 5 });
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  const keys = ["GITHUB_TOKEN", "ADMIN_PASSWORD", "ZENBY", "KOSM", "COE", "JOSIE", "WITCHY", "ARCTIC"];
  const keysFound = keys.filter((key) => typeof process.env[key] === "string" && process.env[key]!.length > 0).length;

  return NextResponse.json({
    ok: true,
    keysFound,
    totalKeys: keys.length,
    timestamp: new Date().toISOString(),
  });
}
