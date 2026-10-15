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
  StorageConfigurationError: abstract new (...args: never[]) => Error;
  notFoundMessage: string;
  unexpectedErrorLabel: string;
  unexpectedErrorMessage: string;
};

const MAX_ID_LENGTH = 200;

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
