/** The category layout the review workbench builds its lightweight lookup from. */
import { api } from "@server/postgres/runtime/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

/** GET /api/editor/category-layout -> categoryLayout.get (null when none is stored) */
export const GET = editorReadRoute({
  auth: "editor",
  label: "category layout",
  read: ({ client }) => client.query(api.categoryLayout.get, {}),
});
