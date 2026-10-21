import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { isGuardString, plainGuardOptions } from "@server/http/guardOptions";

export type FeedbackStatusRouteContext = {
  params: Promise<{ id: string }>;
};

type StatusBody = {
  status?: unknown;
  note?: unknown;
  outcome?: unknown;
};

type FeedbackStatusStore<Status extends string> = {
  transition(
    id: string,
    options: { status: Status; actorEmail: string; note?: string; outcome?: string },
  ): Promise<unknown>;
};

export type FeedbackStatusRouteOptions<Status extends string> = {
  isStatus: (value: unknown) => value is Status;
  isOutcome?: (value: unknown) => boolean;
  getStore: () => Promise<FeedbackStatusStore<Status>>;
  NotFoundError: abstract new (...args: never[]) => Error;
  StorageConfigurationError: abstract new (...args: never[]) => Error;
  notFoundMessage: string;
  unexpectedErrorLabel: string;
  unexpectedErrorMessage: string;
};

const MAX_STATUS_BODY_BYTES = 16 * 1024;

export function feedbackStatusRoute<Status extends string>(options: FeedbackStatusRouteOptions<Status>) {
  const {
    isStatus,
    isOutcome,
    getStore,
    NotFoundError,
    StorageConfigurationError,
    notFoundMessage,
    unexpectedErrorLabel,
    unexpectedErrorMessage,
  } = plainGuardOptions(options, {
    notFoundMessage: isGuardString,
    unexpectedErrorLabel: isGuardString,
    unexpectedErrorMessage: isGuardString,
  });
  const mapError = (error: unknown): NextResponse | null => {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: notFoundMessage }, { status: 404 });
    }

    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    if (error instanceof Error && error.message.startsWith("Illegal transition:")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return null;
  };

  return async function POST(request: Request, context: FeedbackStatusRouteContext) {
    return protectedRouteOperation<StatusBody, { status: Status; note?: string; outcome?: string }>({
      auth: "admin",
      rateLimit: "editorSmallWrite",
      body: {
        maxBytes: MAX_STATUS_BODY_BYTES,
        parse: (body) => {
          const outcome = parseOutcome(body.outcome, isOutcome);
          return {
            status: parseStatus(body.status, isStatus),
            note: parseNote(body.note),
            ...(outcome ? { outcome } : {}),
          };
        },
      },
      unexpectedErrorLabel,
      unexpectedErrorMessage,
      mapError,
      operation: async ({ actorEmail, body }) => {
        const { id } = await Promise.resolve(context.params);
        const store = await getStore();
        const feedback = await store.transition(id, {
          status: body.status,
          actorEmail,
          note: body.note,
          ...(body.outcome ? { outcome: body.outcome } : {}),
        });

        return NextResponse.json({ ok: true, feedback });
      },
    })(request);
  };
}

function parseStatus<Status extends string>(
  value: unknown,
  isStatus: (value: unknown) => value is Status,
): Status {
  if (!isStatus(value)) {
    throw new JsonBodyError(400, "A valid feedback status is required.");
  }

  return value;
}

function parseOutcome(value: unknown, isOutcome: ((value: unknown) => boolean) | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isOutcome || !isOutcome(value)) {
    throw new JsonBodyError(400, "A valid feedback outcome is required.");
  }
  return value as string;
}

function parseNote(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new JsonBodyError(400, "The review note must be text.");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
