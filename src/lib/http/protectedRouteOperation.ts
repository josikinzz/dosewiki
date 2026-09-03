import { NextResponse } from "next/server";
import { requireRoleSession, type RoleSessionGranted } from "@/lib/auth/requireEditorSession";
import type { RoleFloor } from "@/lib/auth/roles";
import { convexRejectionResponse } from "@/lib/http/convexRejection";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { getServerConvexWriteCapability, type ServerConvexWriteCapability, type ServerConvexWriteConfigurationFailure } from "@server/convex/serverWriteCapability";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import type { RateLimitPolicyName } from "@server/http/rateLimitPolicy";

type ConvexWriteCapabilityPolicy = {
  type: "convexWrite";
  errorMessage?: (failure: ServerConvexWriteConfigurationFailure) => string;
};

type ProtectedRouteOperationContext = {
  request: Request;
  auth: RoleSessionGranted;
  actorEmail: string;
  convexWrite?: ServerConvexWriteCapability;
};

type ProtectedRouteOperationOptions<RawBody, ParsedBody> = {
  /**
   * Lowest role admitted. `contributor` is the floor for self-service routes
   * that then check ownership; a banned account (role `viewer`) never passes.
   */
  auth: RoleFloor;
  rateLimit: RateLimitPolicyName;
  body?: {
    maxBytes: number;
    parse?: (body: RawBody, context: ProtectedRouteOperationContext) => ParsedBody;
  };
  capabilities?: ConvexWriteCapabilityPolicy[];
  unexpectedErrorLabel: string;
  unexpectedErrorMessage?: string;
  mapError?: (error: unknown) => NextResponse | null;
  operation: (input: {
    request: Request;
    auth: RoleSessionGranted;
    actorEmail: string;
    body: ParsedBody;
    convexWrite?: ServerConvexWriteCapability;
  }) => Promise<NextResponse> | NextResponse;
};

function mapDefaultError(error: unknown): NextResponse | null {
  if (error instanceof JsonBodyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}

export function protectedRouteOperation<RawBody = unknown, ParsedBody = RawBody>(
  options: ProtectedRouteOperationOptions<RawBody, ParsedBody>,
) {
  return async function handleProtectedRouteOperation(request: Request) {
    const rateLimited = await enforceRateLimit(request, options.rateLimit);
    if (rateLimited) {
      return rateLimited;
    }

    const auth = await requireRoleSession(options.auth);
    if (auth.ok === false) {
      return auth.response;
    }

    const actorEmail = auth.session.user.email;
    let convexWrite: ServerConvexWriteCapability | undefined;
    for (const capabilityPolicy of options.capabilities ?? []) {
      if (capabilityPolicy.type === "convexWrite") {
        const capability = getServerConvexWriteCapability();
        if (capability.ok === false) {
          return NextResponse.json(
            {
              error: capabilityPolicy.errorMessage?.(capability.failure) ?? capability.failure.message,
            },
            { status: 500 },
          );
        }

        convexWrite = capability.capability;
      }
    }

    try {
      const context: ProtectedRouteOperationContext = {
        request,
        auth,
        actorEmail,
        convexWrite,
      };
      const rawBody = options.body
        ? await readJsonBody<RawBody>(request, { maxBytes: options.body.maxBytes })
        : (undefined as RawBody);
      const parsedBody = options.body?.parse ? options.body.parse(rawBody, context) : (rawBody as unknown as ParsedBody);

      return await options.operation({
        request,
        auth,
        actorEmail,
        body: parsedBody,
        convexWrite,
      });
    } catch (error) {
      const mapped = options.mapError?.(error) ?? mapDefaultError(error);
      if (mapped) {
        return mapped;
      }

      // A `ConvexError` is the write layer refusing on purpose, with text meant
      // for whoever triggered the write — a stale value, a slug that is not
      // there, a field nobody may edit. Collapsing those into the generic
      // message leaves an editor unable to tell a mistake from an outage. Every
      // other throw keeps falling through below.
      const rejection = convexRejectionResponse(error);
      if (rejection) {
        // Still logged: an actionable rejection is also how a deployment drift
        // or a client bug shows up, and the client only sees the sentence.
        console.warn(options.unexpectedErrorLabel, error);
        return rejection;
      }

      console.error(options.unexpectedErrorLabel, error);
      return NextResponse.json(
        { error: options.unexpectedErrorMessage ?? "Internal server error." },
        { status: 500 },
      );
    }
  };
}
