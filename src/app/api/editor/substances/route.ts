/**
 * Substance index reads the editor tools take one document or one page at a time.
 *
 *   GET /api/editor/substances?slug=lsd                              -> substanceIndex.getBySlug
 *   GET /api/editor/substances?page=lookup&numItems=200[&cursor=..]  -> substanceIndex.getLookupPage
 *   GET /api/editor/substances?page=search-input&numItems=200[&cursor=..] -> substanceIndex.getSearchInputPage
 *
 * Pages answer with the Postgres pagination envelope (`page`, `continueCursor`,
 * `isDone`); the client threads `continueCursor` back as `cursor`, so the drain
 * is keyset-stable and never offset-based.
 */
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { editorReadRoute, requireParam } from "../editorReadRoute";

export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

export const GET = editorReadRoute({
  auth: "editor",
  label: "substance index",
  read: ({ params, client }) => {
    if (params.has("slug")) {
      return client.query(api.substanceIndex.getBySlug, { slug: requireParam(params, "slug", SLUG_PATTERN) });
    }
    const page = params.get("page");
    const paginationOpts = {
      numItems: Number(requireParam(params, "numItems", /^[1-9][0-9]{0,2}$/)),
      cursor: params.get("cursor"),
    };
    if (page === "lookup") return client.query(api.substanceIndex.getLookupPage, { paginationOpts });
    if (page === "search-input") return client.query(api.substanceIndex.getSearchInputPage, { paginationOpts });
    throw new JsonBodyError(400, "A slug or a supported page is required.");
  },
});
