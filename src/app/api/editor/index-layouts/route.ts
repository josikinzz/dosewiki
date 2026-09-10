/** Public index layouts for the editor shell: every stored psychoactive/chemical/mechanism layout. */
import { api } from "../../../../../convex/_generated/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

/** GET /api/editor/index-layouts -> indexLayouts.getAll */
export const GET = editorReadRoute({
  auth: "contributor",
  label: "index layouts",
  read: ({ client }) => client.query(api.indexLayouts.getAll, {}),
});
