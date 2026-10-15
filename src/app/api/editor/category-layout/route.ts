import { api } from "@server/postgres/runtime/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

export const GET = editorReadRoute({
  auth: "editor",
  label: "category layout",
  read: ({ client }) => client.query(api.categoryLayout.get, {}),
});
