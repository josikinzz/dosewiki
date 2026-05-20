import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/requireAuthenticatedSession";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { getServerConvexWriteCapability, type ServerConvexWriteCapability, type ServerConvexWriteConfigurationFailure } from "@server/convex/serverWriteCapability";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import type { RateLimitPolicyName } from "@server/http/rateLimitPolicy";

type EditorAuth = Awaited<ReturnType<typeof requireEditorSession>>;
type AuthenticatedAuth = Awaited<ReturnType<typeof requireAuthenticatedSession>>;
type SuccessfulAuth = Extract<EditorAuth | AuthenticatedAuth, { ok: true }>;

type ConvexWriteCapabilityPolicy = {
  type: "convexWrite";
  errorMessage?: (failure: ServerConvexWriteConfigurationFailure) => string;
};

type ProtectedRouteOperationContext = {
  request: Request;
  auth: SuccessfulAuth;
  convexWrite?: ServerConvexWriteCapability;
};

type ProtectedRouteOperationOptions<RawBody, ParsedBody> = {
  auth: "editor" | "authenticated";
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
    auth: SuccessfulAuth;
    body: ParsedBody;
    convexWrite?: ServerConvexWriteCapability;
  }) => Promise<NextResponse> | NextResponse;
};

async function requireSession(auth: ProtectedRouteOperationOptions<unknown, unknown>["auth"]) {
  return auth === "editor" ? requireEditorSession() : requireAuthenticatedSession();
}

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

    const auth = await requireSession(options.auth);
    if (auth.ok === false) {
      return auth.response;
    }

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
        convexWrite,
      };
      const rawBody = options.body
        ? await readJsonBody<RawBody>(request, { maxBytes: options.body.maxBytes })
        : (undefined as RawBody);
      const parsedBody = options.body?.parse ? options.body.parse(rawBody, context) : (rawBody as unknown as ParsedBody);

      return await options.operation({
        request,
        auth,
        body: parsedBody,
        convexWrite,
      });
    } catch (error) {
      const mapped = options.mapError?.(error) ?? mapDefaultError(error);
      if (mapped) {
        return mapped;
      }

      console.error(options.unexpectedErrorLabel, error);
      return NextResponse.json(
        { error: options.unexpectedErrorMessage ?? "Internal server error." },
        { status: 500 },
      );
    }
  };
}
