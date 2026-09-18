import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { saveRevalidationPaths } from "../../../../../server/lib/saveRevalidationPaths";
import { revalidateSavedPaths } from "../../save-article/revalidateSavedPaths";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { parseIndexLayoutPayloads, type IndexLayoutPayload } from "../../save-article/saveArticleUtils";
import { parseCopyIndexPublicationInput, type CopyIndexPublicationInput } from "../copyIndexPublicationInput";

export const GET = protectedRouteOperation({
  auth: "editor", rateLimit: "diagnosticRead", capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load index editing source:", unexpectedErrorMessage: "The index editing source could not be loaded.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    const type = new URL(request.url).searchParams.get("type");
    const auth = { apiKey: dataWrite!.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite!.adminKey, actorEmail };
    if (type === "all") return NextResponse.json(await dataWrite!.client.query(api.indexLayouts.getAllForEditor, auth));
    if (type !== "psychoactive" && type !== "chemical" && type !== "mechanism") throw new JsonBodyError(400, "A supported index type is required.");
    return NextResponse.json(await dataWrite!.client.query(api.indexLayouts.getForEditor, { ...auth, type }));
  },
});

export const POST = protectedRouteOperation<{ layout?: unknown; expected?: unknown; expectedRevision?: unknown; operationId?: unknown }, { layout: IndexLayoutPayload; expected: unknown } & CopyIndexPublicationInput>({
  auth: "admin", rateLimit: "editorSmallWrite", capabilities: [{ type: "dataWrite" }],
  body: { maxBytes: 1024 * 1024, parse(raw) {
    const layout = parseIndexLayoutPayloads([raw.layout])[0];
    if (!layout || !Object.prototype.hasOwnProperty.call(raw, "expected")) throw new JsonBodyError(400, "A supported layout and its loaded baseline are required.");
    return { layout, expected: raw.expected, ...parseCopyIndexPublicationInput(raw) };
  } },
  unexpectedErrorLabel: "Index publication failed", unexpectedErrorMessage: "Index publication failed. Your local draft is preserved.",
  operation: async ({ body, actorEmail, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability required");
    const receipt = await dataWrite.client.mutation(api.indexLayouts.save, { ...body.layout, expected: body.expected, expectedRevision: body.expectedRevision, operationId: body.operationId, actorEmail, apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey });
    await revalidateSavedPaths(saveRevalidationPaths([], [body.layout.type]), "save-article");
    return NextResponse.json({ ok: true, revision: receipt.revision, replayed: receipt.replayed, unchanged: receipt.unchanged });
  },
});
