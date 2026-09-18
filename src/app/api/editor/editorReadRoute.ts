/**
 * Shared shape of the `/api/editor/*` read endpoints.
 *
 * The editor surfaces (`/dev`, `/review`) used to subscribe to public Postgres
 * queries from the browser. Those reads now go through these routes so the
 * browser holds no data-backend client at all: the route checks the editor
 * session, then runs the same registered query through the server read client
 * (`getServerDataReadClient`), which is Postgres over HTTP or the in-process
 * Postgres runtime depending on `DATA_BACKEND`.
 *
 * Every route answers one query family with the exact JSON the Postgres hook
 * used to deliver, so the TanStack hooks in `src/hooks/useEditorRead.ts` can
 * hand components an unchanged shape.
 *
 * GET requests skip `protectedRouteOperation`'s origin gate (browsers omit
 * `Origin` on same-origin GETs), so this helper adds the read-side equivalent:
 * a foreign `Origin` or a cross-site `Sec-Fetch-Site` is refused. Cookie
 * reads are not a CSRF vector, but these bodies are editor-only projections
 * and there is no reason to serve them to another site.
 */
import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import type { RoleFloor } from "@/lib/auth/roles";
import { getServerDataReadClient, type ServerReadClient } from "@server/data/serverClient";

export type EditorReadOperation = (input: {
  params: URLSearchParams;
  client: ServerReadClient;
}) => Promise<unknown>;

export function isForeignReadRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) return true;
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none";
}

/** Reject a missing or malformed query-string value with a 400 instead of forwarding it. */
export function requireParam(params: URLSearchParams, name: string, pattern: RegExp): string {
  const value = params.get(name);
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new JsonBodyError(400, `A valid ${name} is required.`);
  }
  return value;
}

export function editorReadRoute(options: {
  auth: RoleFloor;
  label: string;
  read: EditorReadOperation;
}) {
  const operation = protectedRouteOperation({
    auth: options.auth,
    rateLimit: "editorPolledRead",
    unexpectedErrorLabel: `Failed to load ${options.label} via Next route:`,
    unexpectedErrorMessage: `The ${options.label} could not be loaded.`,
    operation: async ({ request }) => {
      const params = new URL(request.url).searchParams;
      const result = await options.read({ params, client: getServerDataReadClient() });
      // A Postgres query may resolve to `null` (no document); JSON carries that
      // as-is. `undefined` never crosses the wire, which is what lets the
      // hooks keep "undefined means loading".
      return NextResponse.json(result ?? null);
    },
  });

  return async function handleEditorRead(request: Request) {
    if (isForeignReadRequest(request)) {
      const response = NextResponse.json(
        { error: "Editor data is only served to the editor itself.", code: "ORIGIN_REQUIRED" },
        { status: 403 },
      );
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    return operation(request);
  };
}
