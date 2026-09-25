import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export type FeedbackItemRouteContext = {
  params: Promise<{ id: string }>;
};

type FeedbackItemStore = {
  get(id: string): Promise<unknown>;
};

export type FeedbackItemRouteOptions = {
  getStore: () => Promise<FeedbackItemStore>;
  /** Thrown by the store factory when storage is unconfigured; mapped to 503. */
  StorageConfigurationError: abstract new (...args: never[]) => Error;
  notFoundMessage: string;
  unexpectedErrorLabel: string;
  unexpectedErrorMessage: string;
};

const MAX_ID_LENGTH = 200;

/**
 * Editor read of one feedback item, for a task link that names it.
 *
 *   GET {base}/{id}  → { ok, feedback } or 404
 *
 * The same floor and row shape as the queue read, so a link opens exactly
 * what the queue would list. An id no row has answers 404, which the queue
 * shows as an explicit "no longer exists" state rather than an empty review.
 */
export function feedbackItemRoute(options: FeedbackItemRouteOptions) {
  return async function GET(request: Request, context: FeedbackItemRouteContext) {
    return protectedRouteOperation({
      auth: "editor",
      rateLimit: "diagnosticRead",
      unexpectedErrorLabel: options.unexpectedErrorLabel,
      unexpectedErrorMessage: options.unexpectedErrorMessage,
      mapError: (error) =>
        error instanceof options.StorageConfigurationError
          ? NextResponse.json({ error: error.message }, { status: 503 })
          : null,
      operation: async () => {
        const { id } = await Promise.resolve(context.params);
        if (!id || id.length > MAX_ID_LENGTH) {
          return NextResponse.json({ error: options.notFoundMessage }, { status: 404 });
        }
        const store = await options.getStore();
        const feedback = await store.get(id);
        if (!feedback) {
          return NextResponse.json({ error: options.notFoundMessage }, { status: 404 });
        }
        return NextResponse.json({ ok: true, feedback });
      },
    })(request);
  };
}
