/** The server change log feed shown on the /dev change log tab. */
import { api } from "@server/postgres/runtime/api";
import { editorReadRoute, requireParam } from "../editorReadRoute";

export const runtime = "nodejs";

/** GET /api/editor/changelog?limit=100 -> changelog.getRecent (the handler caps limit at 500) */
export const GET = editorReadRoute({
  auth: "editor",
  label: "change log",
  read: ({ params, client }) =>
    client.query(api.changelog.getRecent, { limit: Number(requireParam(params, "limit", /^[1-9][0-9]{0,3}$/)) }),
});
