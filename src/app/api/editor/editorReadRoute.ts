import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { foreignOriginResponse } from "@/lib/http/requestOrigin";
import type { RoleFloor } from "@/lib/auth/roles";
import { getServerDataReadClient, type ServerReadClient } from "@server/data/serverClient";
import { plainGuardOptions } from "@server/http/guardOptions";

export type EditorReadOperation = (input: {
  params: URLSearchParams;
  client: ServerReadClient;
}) => Promise<unknown>;

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
  const { auth, label, read } = plainGuardOptions(options, { required: ["auth", "label"] });
  const operation = protectedRouteOperation({
    auth,
    rateLimit: "editorPolledRead",
    unexpectedErrorLabel: `Failed to load ${label} via Next route:`,
    unexpectedErrorMessage: `The ${label} could not be loaded.`,
    operation: async ({ request }) => {
      const params = new URL(request.url).searchParams;
      const result = await read({ params, client: getServerDataReadClient() });
      return NextResponse.json(result ?? null);
    },
  });

  return async function handleEditorRead(request: Request) {
    return foreignOriginResponse(request, "editorRead") ?? operation(request);
  };
}
