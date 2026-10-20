import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { ServerDataWriteCapability } from "@server/data/serverWriteCapability";
import type { RateLimitPolicyName } from "@server/http/rateLimitPolicy";

type CitationEvidenceOperationInput = {
  request: Request;
  actorEmail: string;
  dataWrite: ServerDataWriteCapability;
};

export function citationEvidenceRouteOperation({
  rateLimit,
  unexpectedErrorLabel,
  unexpectedErrorMessage,
  mapError,
  operation,
}: {
  rateLimit?: RateLimitPolicyName;
  unexpectedErrorLabel: string;
  unexpectedErrorMessage: string;
  mapError?: (error: unknown) => NextResponse | null;
  operation: (input: CitationEvidenceOperationInput) => Promise<NextResponse> | NextResponse;
}) {
  return protectedRouteOperation({
    auth: "editor",
    rateLimit: rateLimit ?? "editorSmallWrite",
    capabilities: [{ type: "dataWrite" }],
    unexpectedErrorLabel,
    unexpectedErrorMessage,
    mapError,
    operation: ({ request, actorEmail, dataWrite }) => {
      if (!dataWrite) {
        throw new Error("Postgres write capability is required.");
      }

      return operation({
        request,
        actorEmail,
        dataWrite,
      });
    },
  });
}
