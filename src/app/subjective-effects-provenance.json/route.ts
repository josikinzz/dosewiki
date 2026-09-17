import { NextResponse } from "next/server";
import subjectiveEffectsProvenance from "@data/effects/subjectiveEffectsProvenance.json";

/**
 * Downloadable copy of `data/effects/subjectiveEffectsProvenance.json`, the
 * manifest /docs/license links to. Serving the tracked dataset directly keeps
 * one copy in the repository instead of a second byte-identical file under
 * public/; `npm run generate:subjective-effects-provenance` refreshes it.
 */
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(subjectiveEffectsProvenance, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
