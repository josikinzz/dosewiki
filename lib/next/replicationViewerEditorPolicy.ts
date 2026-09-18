import { NextResponse } from "next/server";
import { isEditorHost } from "./publicHostPolicy";

type ReplicationViewerEditorRoute = (request: Request) => Promise<NextResponse>;

/**
 * Reject public hosts before auth, rate limits, or Postgres configuration run.
 * Effect Index intentionally has none of the editor's credentials.
 */
export function replicationViewerEditorRoute(
  handler: ReplicationViewerEditorRoute,
): ReplicationViewerEditorRoute {
  return async (request) => {
    const host = request.headers.get("host") ?? new URL(request.url).host;
    if (process.env.NODE_ENV !== "development" && !isEditorHost(host)) {
      return NextResponse.json(
        { error: "This editor is not available on this host." },
        { status: 404 },
      );
    }

    return handler(request);
  };
}
