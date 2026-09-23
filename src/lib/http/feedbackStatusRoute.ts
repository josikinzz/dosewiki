import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";

export type FeedbackStatusRouteContext = {
  params: Promise<{ id: string }>;
};

type StatusBody = {
  status?: unknown;
  note?: unknown;
};

type FeedbackStatusStore<Status extends string> = {
  transition(
    id: string,
    options: { status: Status; actorEmail: string; note?: string },
  ): Promise<unknown>;
};

export type FeedbackStatusRouteOptions<Status extends string> = {
  /** Type guard over the route's status vocabulary. */
  isStatus: (value: unknown) => value is Status;
  getStore: () => Promise<FeedbackStatusStore<Status>>;
  /** Thrown by the store when the id names no row; mapped to 404. */
  NotFoundError: abstract new (...args: never[]) => Error;
  /** Thrown by the store factory when storage is unconfigured; mapped to 503. */
  StorageConfigurationError: abstract new (...args: never[]) => Error;
  notFoundMessage: string;
  unexpectedErrorLabel: string;
  unexpectedErrorMessage: string;
};

const MAX_STATUS_BODY_BYTES = 16 * 1024;

/**
 * Admin-only status transition for a feedback queue. Article feedback and site
 * feedback share every rule (origin gate, rate limit, admin floor, body
 * grammar, error mapping); only the store and its error vocabulary differ.
 */
export function feedbackStatusRoute<Status extends string>(
  options: FeedbackStatusRouteOptions<Status>,
) {
  return async function POST(request: Request, context: FeedbackStatusRouteContext) {
    return protectedRouteOperation<StatusBody, { status: Status; note?: string }>({
      // Triage moves feedback through the queue; that is an admin decision.
      auth: "admin",
      rateLimit: "editorSmallWrite",
      body: {
        maxBytes: MAX_STATUS_BODY_BYTES,
        parse: (body) => ({ status: parseStatus(body.status, options.isStatus), note: parseNote(body.note) }),
      },
      unexpectedErrorLabel: options.unexpectedErrorLabel,
      unexpectedErrorMessage: options.unexpectedErrorMessage,
      // Total, so every failure keeps this route's own response shape.
      mapError: (error) => mapStatusRouteError(error, options),
      operation: async ({ actorEmail, body }) => {
        const { id } = await Promise.resolve(context.params);
        const store = await options.getStore();
        const feedback = await store.transition(id, {
          status: body.status,
          actorEmail,
          note: body.note,
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

function mapStatusRouteError<Status extends string>(
  error: unknown,
  options: FeedbackStatusRouteOptions<Status>,
): NextResponse {
  if (error instanceof JsonBodyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof options.NotFoundError) {
    return NextResponse.json({ error: options.notFoundMessage }, { status: 404 });
  }

  if (error instanceof options.StorageConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  if (error instanceof Error && error.message.startsWith("Illegal transition:")) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(options.unexpectedErrorLabel, error);
  return NextResponse.json({ error: options.unexpectedErrorMessage }, { status: 500 });
}
