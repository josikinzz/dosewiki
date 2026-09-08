import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Infer } from "convex/values";
import { substanceArticleLightValidator } from "../../../../../convex/lib/validators";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { sanitizeArticleForConvexMutation } from "../../save-to-convex/saveToConvexUtils";
import { revalidateSavedPaths } from "../../save-to-convex/revalidateSavedPaths";

export const runtime = "nodejs";
const slugPattern = /^[a-z0-9][a-z0-9-]*$/;
export const GET = protectedRouteOperation({
  auth: "editor", rateLimit: "diagnosticRead", capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to read private article lifecycle:", unexpectedErrorMessage: "Unable to load this article draft and history.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    const slug = new URL(request.url).searchParams.get("slug") ?? "";
    if (!slugPattern.test(slug)) throw new JsonBodyError(400, "A valid article slug is required.");
    const state = await convexWrite!.client.query(api.articleLifecycle.get, {
      apiKey: convexWrite!.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite!.adminKey, actorEmail, slug,
    });
    return NextResponse.json({ ok: true, ...state });
  },
});

type Action = "saveDraft" | "discardDraft" | "publish" | "submit" | "restore";
type Body = { action?: unknown; slug?: unknown; baseHash?: unknown; changeId?: unknown; article?: unknown; summary?: unknown; revisionId?: unknown; revisionOf?: unknown; draftVersion?: unknown };
type Parsed = { action: Action; slug: string; baseHash: string; changeId: string; article?: Infer<typeof substanceArticleLightValidator>; summary?: string; revisionId?: Id<"articleRevisions">; revisionOf?: Id<"changeProposals">; draftVersion?: number };
export const POST = protectedRouteOperation<Body, Parsed>({
  auth: "editor", rateLimit: "editorHeavyWrite", capabilities: [{ type: "convexWrite" }],
  body: { maxBytes: 2 * 1024 * 1024, parse: (raw) => {
    if (!["saveDraft", "discardDraft", "publish", "submit", "restore"].includes(String(raw.action))) throw new JsonBodyError(400, "Choose a supported article action.");
    if (typeof raw.slug !== "string" || !slugPattern.test(raw.slug)) throw new JsonBodyError(400, "A valid article slug is required.");
    if (typeof raw.baseHash !== "string" || !raw.baseHash || typeof raw.changeId !== "string" || !raw.changeId) throw new JsonBodyError(400, "The loaded base revision and a stable change ID are required.");
    if (raw.draftVersion !== undefined && (typeof raw.draftVersion !== "number" || !Number.isInteger(raw.draftVersion) || raw.draftVersion < 0)) throw new JsonBodyError(400, "The draft version must be a non-negative integer.");
    return {
      action: raw.action as Action, slug: raw.slug, baseHash: raw.baseHash, changeId: raw.changeId,
      ...(raw.article !== undefined ? { article: sanitizeArticleForConvexMutation(raw.article) as Infer<typeof substanceArticleLightValidator> } : {}),
      ...(typeof raw.summary === "string" ? { summary: raw.summary } : {}),
      ...(typeof raw.revisionId === "string" ? { revisionId: raw.revisionId as Id<"articleRevisions"> } : {}),
      ...(typeof raw.revisionOf === "string" ? { revisionOf: raw.revisionOf as Id<"changeProposals"> } : {}),
      ...(typeof raw.draftVersion === "number" ? { draftVersion: raw.draftVersion } : {}),
    };
  } },
  unexpectedErrorLabel: "Failed to write article lifecycle:", unexpectedErrorMessage: "Unable to complete this article action. Your local changes are preserved.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    const result = await convexWrite!.client.mutation(api.articleLifecycle.write, {
      ...body, apiKey: convexWrite!.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite!.adminKey, actorEmail,
    });
    if (body.action === "publish" || body.action === "restore") await revalidateSavedPaths([`/${body.slug}`], "manual");
    return NextResponse.json({ ok: true, ...result });
  },
});
