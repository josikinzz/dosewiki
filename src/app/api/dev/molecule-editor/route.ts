import { NextResponse } from "next/server";
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const SLUG_PATTERN = /^(class:)?[a-z0-9][a-z0-9-]*$/;
const CLASS_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
type PageArgs = { apiKey?: string; actorEmail?: string; paginationOpts: { numItems: number; cursor: string | null } };
type PickerRow = { slug: string; title: string; priority?: string | null; index_categories?: string[] | null; classification?: unknown; hasOverride: boolean };
type Page = { page: PickerRow[]; continueCursor: string; isDone: boolean };
type Source = { slug: string; smiles: string } | null;
type EditSource = { slug: string; molblock: string; boldBonds?: number[]; source: string; updatedAt: string | number } | null;

const listPickerPage = makeFunctionReference<"query", PageArgs, Page>("moleculeEditor:listPickerPage");
const listClassMembers = makeFunctionReference<"query", PageArgs & { classKey: string }, Page>("moleculeEditor:listClassMembers");
const getSource = makeFunctionReference<"query", { apiKey?: string; actorEmail?: string; slug: string }, Source>("moleculeEditor:getSource");
const getEditSource = makeFunctionReference<"query", { apiKey?: string; actorEmail?: string; slug: string }, EditSource>("moleculeEditor:getEditSource");

function required(value: string | null, name: string, pattern: RegExp): string {
  const normalized = value?.trim() ?? "";
  if (!pattern.test(normalized)) throw new JsonBodyError(400, `A valid ${name} is required.`);
  return normalized;
}

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "editorPolledRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load molecule editor data via Next route:",
  unexpectedErrorMessage: "The molecule editor data could not be loaded.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");
    const params = new URL(request.url).searchParams;
    const scope = params.get("scope");
    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    if (scope === "source" || scope === "edit-source") {
      const slug = required(params.get("slug"), "slug", SLUG_PATTERN);
      const result = scope === "source"
        ? await dataWrite.client.query(getSource, { apiKey, actorEmail, slug })
        : await dataWrite.client.query(getEditSource, { apiKey, actorEmail, slug });
      return NextResponse.json(result);
    }
    const numItems = Number(required(params.get("numItems"), "numItems", /^[1-9][0-9]{0,2}$/));
    const paginationOpts = { numItems, cursor: params.get("cursor") };
    const result = scope === "picker"
      ? await dataWrite.client.query(listPickerPage, { apiKey, actorEmail, paginationOpts })
      : scope === "class-members"
        ? await dataWrite.client.query(listClassMembers, {
            apiKey,
            actorEmail,
            classKey: required(params.get("classKey"), "classKey", CLASS_PATTERN),
            paginationOpts,
          })
        : null;
    if (!result) throw new JsonBodyError(400, "A supported molecule editor scope is required.");
    return NextResponse.json(result);
  },
});
