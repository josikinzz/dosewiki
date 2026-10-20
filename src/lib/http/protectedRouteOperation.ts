import { isDataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
import { NextResponse } from "next/server";
import { requireRoleSession, type RoleSessionGranted } from "@/lib/auth/requireEditorSession";
import type { RoleFloor } from "@/lib/auth/roles";
import { dataRejectionResponse } from "@/lib/http/dataRejection";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { foreignOriginResponse } from "@/lib/http/requestOrigin";
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
  auth: RoleFloor;
  rateLimit: RateLimitPolicyName;
  rateLimitKeySuffix?: string;
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
  if (isDataWriteFrozenError(error)) return NextResponse.json({ error: "Data writes are frozen.", code: error.code }, { status: 503 });
  if (error instanceof JsonBodyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}

export function protectedRouteOperation<RawBody = unknown, ParsedBody = RawBody>({
  auth: authFloor,
  rateLimit,
  rateLimitKeySuffix,
  body,
  capabilities,
  unexpectedErrorLabel,
  unexpectedErrorMessage,
  mapError,
  operation,
}: ProtectedRouteOperationOptions<RawBody, ParsedBody>) {
  const maxBodyBytes = body?.maxBytes;
  const parseBody = body?.parse;
  const dataWritePolicy = capabilities?.find((policy) => policy.type === "dataWrite");
  const dataWriteErrorMessage = dataWritePolicy?.errorMessage;
  const handle = async (request: Request): Promise<NextResponse> => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
      const foreign = foreignOriginResponse(request, "editorWrite");
      if (foreign) return foreign;
    }
    const rateLimited = await enforceRateLimit(request, rateLimit, { keySuffix: rateLimitKeySuffix });
    if (rateLimited) {
      return rateLimited;
    }

    const auth = await requireRoleSession(authFloor);
    if (auth.ok === false) {
      return auth.response;
    }

    const actorEmail = auth.session.user.email;
    let dataWrite: ServerDataWriteCapability | undefined;
    if (dataWritePolicy) {
      const capability = getServerDataWriteCapability();
      if (capability.ok === false) {
        return NextResponse.json(
          {
            error: dataWriteErrorMessage?.(capability.failure) ?? capability.failure.message,
          },
          { status: 500 },
        );
      }

      dataWrite = capability.capability;
    }

    try {
      const context: ProtectedRouteOperationContext = {
        request,
        auth,
        actorEmail,
        dataWrite,
      };
      const rawBody = maxBodyBytes !== undefined
        ? await readJsonBody<RawBody>(request, { maxBytes: maxBodyBytes })
        : (undefined as RawBody);
      const parsedBody = parseBody ? parseBody(rawBody, context) : (rawBody as unknown as ParsedBody);

      return await operation({
        request,
        auth,
        actorEmail,
        body: parsedBody,
        dataWrite,
      });
    } catch (error) {
      const mapped = mapError?.(error) ?? mapDefaultError(error);
      if (mapped) {
        return mapped;
      }

      const rejection = dataRejectionResponse(error);
      if (rejection) {
        console.warn(unexpectedErrorLabel, error);
        return rejection;
      }

      console.error(unexpectedErrorLabel, error);
      return NextResponse.json(
        { error: unexpectedErrorMessage ?? "Internal server error." },
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
