/** Every copy block row, for the Copy Studio rail. */
import { api } from "../../../../../convex/_generated/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

/** GET /api/editor/copy-blocks -> copyBlocks.getAll */
export const GET = editorReadRoute({
  auth: "editor",
  label: "copy blocks",
  read: ({ client }) => client.query(api.copyBlocks.getAll, {}),
});
