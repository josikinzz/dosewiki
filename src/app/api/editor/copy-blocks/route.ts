import { api } from "@server/postgres/runtime/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

export const GET = editorReadRoute({
  auth: "editor",
  label: "copy block catalogue",
  read: ({ client }) => client.query(api.copyBlocks.getEditorCatalogue, {}),
});
