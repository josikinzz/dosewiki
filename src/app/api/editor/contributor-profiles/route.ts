/** The contributor directory the people tools and change log attribute work with. */
import { api } from "@server/postgres/runtime/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

/** GET /api/editor/contributor-profiles -> contributorProfiles.getAll */
export const GET = editorReadRoute({
  auth: "contributor",
  label: "contributor profiles",
  read: ({ client }) => client.query(api.contributorProfiles.getAll, {}),
});
