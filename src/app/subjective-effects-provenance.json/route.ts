import { NextResponse } from "next/server";
import subjectiveEffectsProvenance from "@data/effects/subjectiveEffectsProvenance.json";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(subjectiveEffectsProvenance, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
