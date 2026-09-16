import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@server/postgres/runtime/api";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { effectEditorSchema } from "@/features/effects/editing/effectEditorModel";

const schema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), expectedRevision: z.string().length(64), operationId: z.string().uuid(), draft: effectEditorSchema });
type Body = z.infer<typeof schema>;
export const GET = protectedRouteOperation<undefined, undefined>({
  auth: "admin", rateLimit: "editorSmallWrite", capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Reading effect editor", unexpectedErrorMessage: "Unable to load this effect.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres capability is required.");
    const slug = new URL(request.url).searchParams.get("slug");
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new JsonBodyError(400, "A valid effect slug is required.");
    const result = await dataWrite.client.query(api.subjectiveEffects.getForEditor, { slug, actorEmail, apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey });
    if (!result) throw new JsonBodyError(404, "Effect not found.");
    return NextResponse.json({ ok: true, ...result });
  },
});
export const POST = protectedRouteOperation<Body, Body>({
  auth: "admin", rateLimit: "editorSmallWrite", capabilities: [{ type: "dataWrite" }],
  body: { maxBytes: 2 * 1024 * 1024, parse: raw => { const parsed = schema.safeParse(raw); if (!parsed.success) throw new JsonBodyError(400, parsed.error.issues[0].message); return parsed.data; } },
  unexpectedErrorLabel: "Publishing effect editor", unexpectedErrorMessage: "Unable to publish this effect. Your local edits are retained.",
  operation: async ({ body, actorEmail, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres capability is required.");
    const result = await dataWrite.client.mutation(api.subjectiveEffects.publishFromEditor, { ...body, actorEmail, apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey });
    // The published effect page and the effects index both read this row.
    await publishPublicCache({ targets: [{ kind: "effect", slug: body.slug }], source: "manual" });
    return NextResponse.json({ ok: true, ...result });
  },
});
