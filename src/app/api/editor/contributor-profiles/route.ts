import { api } from "@server/postgres/runtime/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

export const GET = editorReadRoute({
  auth: "contributor",
  label: "contributor profiles",
  read: ({ client }) => client.query(api.contributorProfiles.getAll, {}),
});
