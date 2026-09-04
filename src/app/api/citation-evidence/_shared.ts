import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { ServerConvexWriteCapability } from "@server/convex/serverWriteCapability";
import type { RateLimitPolicyName } from "@server/http/rateLimitPolicy";

type CitationEvidenceOperationInput = {
  request: Request;
  actorEmail: string;
  convexWrite: ServerConvexWriteCapability;
};

export function citationEvidenceRouteOperation(options: {
  rateLimit?: RateLimitPolicyName;
  unexpectedErrorLabel: string;
  unexpectedErrorMessage: string;
  mapError?: (error: unknown) => NextResponse | null;
  operation: (input: CitationEvidenceOperationInput) => Promise<NextResponse> | NextResponse;
}) {
  return protectedRouteOperation({
    auth: "editor",
    rateLimit: options.rateLimit ?? "editorSmallWrite",
    capabilities: [{ type: "convexWrite" }],
    unexpectedErrorLabel: options.unexpectedErrorLabel,
    unexpectedErrorMessage: options.unexpectedErrorMessage,
    mapError: options.mapError,
    operation: ({ request, actorEmail, convexWrite }) => {
      if (!convexWrite) {
        throw new Error("Convex write capability is required.");
      }

      return options.operation({
        request,
        actorEmail,
        convexWrite,
      });
    },
  });
}
