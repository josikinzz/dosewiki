import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { plainGuardOptions } from "@server/http/guardOptions";

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
  const {
    getStore,
    StorageConfigurationError,
    notFoundMessage,
    unexpectedErrorLabel,
    unexpectedErrorMessage,
  } = plainGuardOptions(options);
  return async function GET(request: Request, context: FeedbackItemRouteContext) {
    return protectedRouteOperation({
      auth: "editor",
      rateLimit: "diagnosticRead",
      unexpectedErrorLabel,
      unexpectedErrorMessage,
      mapError: (error) =>
        error instanceof StorageConfigurationError
          ? NextResponse.json({ error: error.message }, { status: 503 })
          : null,
      operation: async () => {
        const { id } = await Promise.resolve(context.params);
        if (!id || id.length > MAX_ID_LENGTH) {
          return NextResponse.json({ error: notFoundMessage }, { status: 404 });
        }
        const store = await getStore();
        const feedback = await store.get(id);
        if (!feedback) {
          return NextResponse.json({ error: notFoundMessage }, { status: 404 });
        }
        return NextResponse.json({ ok: true, feedback });
      },
    })(request);
  };
}
