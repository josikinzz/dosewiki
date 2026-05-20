import { NextResponse } from "next/server";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { getServerConvexWriteCapability, type ServerConvexWriteCapability } from "@server/convex/serverWriteCapability";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import type { RateLimitPolicyName } from "@server/http/rateLimitPolicy";

type SuccessfulEditorAuth = Extract<Awaited<ReturnType<typeof requireEditorSession>>, { ok: true }>;

export type CitationEvidenceRouteContext =
  | {
      ok: true;
      auth: SuccessfulEditorAuth;
      convexWrite: ServerConvexWriteCapability;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireCitationEvidenceRouteContext(
  request: Request,
  rateLimit: RateLimitPolicyName = "editorSmallWrite",
): Promise<CitationEvidenceRouteContext> {
  const rateLimited = await enforceRateLimit(request, rateLimit);
  if (rateLimited) {
    return {
      ok: false,
      response: rateLimited,
    };
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth;
  }

  const capability = getServerConvexWriteCapability();
  if (capability.ok === false) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: capability.failure.message },
        { status: 500 },
      ),
    };
  }

  return {
    ok: true,
    auth,
    convexWrite: capability.capability,
  };
}
