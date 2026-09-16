import { NextResponse } from "next/server";
import { requireRoleSession, type RoleSessionGranted } from "@/lib/auth/requireEditorSession";
import type { RoleFloor } from "@/lib/auth/roles";
import { dataRejectionResponse } from "@/lib/http/dataRejection";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { getServerDataWriteCapability, type ServerDataWriteCapability, type ServerDataWriteConfigurationFailure } from "@server/data/serverWriteCapability";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import type { RateLimitPolicyName } from "@server/http/rateLimitPolicy";

type DataWriteCapabilityPolicy = {
  type: "dataWrite";
  errorMessage?: (failure: ServerDataWriteConfigurationFailure) => string;
};

type ProtectedRouteOperationContext = {
  request: Request;
  auth: RoleSessionGranted;
  actorEmail: string;
  dataWrite?: ServerDataWriteCapability;
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
  capabilities?: DataWriteCapabilityPolicy[];
  unexpectedErrorLabel: string;
  unexpectedErrorMessage?: string;
  mapError?: (error: unknown) => NextResponse | null;
  operation: (input: {
    request: Request;
    auth: RoleSessionGranted;
    actorEmail: string;
    body: ParsedBody;
    dataWrite?: ServerDataWriteCapability;
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
  const handle = async (request: Request): Promise<NextResponse> => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
      const origin = request.headers.get("origin");
      const fetchSite = request.headers.get("sec-fetch-site");
      // Origin is browser-controlled. Never trust forwarded host headers to
      // turn a foreign origin into an allowed cookie-authenticated mutation.
      if ((origin !== new URL(request.url).origin) ||
          (fetchSite !== null && fetchSite !== "same-origin")) {
        return NextResponse.json(
          { error: "This change must be sent from the same site. Reload the editor and try again.", code: "ORIGIN_REQUIRED" },
          { status: 403 },
        );
      }
    }
    const rateLimited = await enforceRateLimit(request, options.rateLimit);
    if (rateLimited) {
      return rateLimited;
    }

    const auth = await requireRoleSession(options.auth);
    if (auth.ok === false) {
      return auth.response;
    }

    const actorEmail = auth.session.user.email;
    let dataWrite: ServerDataWriteCapability | undefined;
    for (const capabilityPolicy of options.capabilities ?? []) {
      if (capabilityPolicy.type === "dataWrite") {
        const capability = getServerDataWriteCapability();
        if (capability.ok === false) {
          return NextResponse.json(
            {
              error: capabilityPolicy.errorMessage?.(capability.failure) ?? capability.failure.message,
            },
            { status: 500 },
          );
        }

        dataWrite = capability.capability;
      }
    }

    try {
      const context: ProtectedRouteOperationContext = {
        request,
        auth,
        actorEmail,
        dataWrite,
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
        dataWrite,
      });
    } catch (error) {
      const mapped = options.mapError?.(error) ?? mapDefaultError(error);
      if (mapped) {
        return mapped;
      }

      // A `PostgresError` is the write layer refusing on purpose, with text meant
      // for whoever triggered the write — a stale value, a slug that is not
      // there, a field nobody may edit. Collapsing those into the generic
      // message leaves an editor unable to tell a mistake from an outage. Every
      // other throw keeps falling through below.
      const rejection = dataRejectionResponse(error);
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
  return async function handleProtectedRouteOperation(request: Request) {
    const response = await handle(request);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", [...new Set([...(response.headers.get("Vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean), "Cookie"])].join(", "));
    return response;
  };
}
