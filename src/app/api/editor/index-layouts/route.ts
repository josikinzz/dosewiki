import { api } from "@server/postgres/runtime/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

export const GET = editorReadRoute({
  auth: "contributor",
  label: "index layouts",
  read: ({ client }) => client.query(api.indexLayouts.getAll, {}),
});
