import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { saveRevalidationPaths } from "../../../../../convex/lib/saveRevalidationPaths";
import { revalidateSavedPaths } from "../../save-to-convex/revalidateSavedPaths";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { parseIndexLayoutPayloads, type IndexLayoutPayload } from "../../save-to-convex/saveToConvexUtils";
import { parseCopyIndexPublicationInput, type CopyIndexPublicationInput } from "../copyIndexPublicationInput";

export const GET = protectedRouteOperation({
  auth: "editor", rateLimit: "diagnosticRead", capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load index editing source:", unexpectedErrorMessage: "The index editing source could not be loaded.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    const type = new URL(request.url).searchParams.get("type");
    const auth = { apiKey: convexWrite!.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite!.adminKey, actorEmail };
    if (type === "all") return NextResponse.json(await convexWrite!.client.query(api.indexLayouts.getAllForEditor, auth));
    if (type !== "psychoactive" && type !== "chemical" && type !== "mechanism") throw new JsonBodyError(400, "A supported index type is required.");
    return NextResponse.json(await convexWrite!.client.query(api.indexLayouts.getForEditor, { ...auth, type }));
  },
});

export const POST = protectedRouteOperation<{ layout?: unknown; expected?: unknown; expectedRevision?: unknown; operationId?: unknown }, { layout: IndexLayoutPayload; expected: unknown } & CopyIndexPublicationInput>({
  auth: "admin", rateLimit: "editorSmallWrite", capabilities: [{ type: "convexWrite" }],
  body: { maxBytes: 1024 * 1024, parse(raw) {
    const layout = parseIndexLayoutPayloads([raw.layout])[0];
    if (!layout || !Object.prototype.hasOwnProperty.call(raw, "expected")) throw new JsonBodyError(400, "A supported layout and its loaded baseline are required.");
    return { layout, expected: raw.expected, ...parseCopyIndexPublicationInput(raw) };
  } },
  unexpectedErrorLabel: "Index publication failed", unexpectedErrorMessage: "Index publication failed. Your local draft is preserved.",
  operation: async ({ body, actorEmail, convexWrite }) => {
    if (!convexWrite) throw new Error("Convex write capability required");
    const receipt = await convexWrite.client.mutation(api.indexLayouts.save, { ...body.layout, expected: body.expected, expectedRevision: body.expectedRevision, operationId: body.operationId, actorEmail, apiKey: convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey });
    await revalidateSavedPaths(saveRevalidationPaths([], [body.layout.type]), "save-to-convex");
    return NextResponse.json({ ok: true, revision: receipt.revision, replayed: receipt.replayed, unchanged: receipt.unchanged });
  },
});
