/** Compact copy-block catalogue for the Copy Studio rail. */
import { api } from "@server/postgres/runtime/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

/** GET /api/editor/copy-blocks -> copyBlocks.getEditorCatalogue */
export const GET = editorReadRoute({
  auth: "editor",
  label: "copy block catalogue",
  read: ({ client }) => client.query(api.copyBlocks.getEditorCatalogue, {}),
});
