import { api } from "@server/postgres/runtime/api";
import { editorReadRoute, requireParam } from "../editorReadRoute";

export const runtime = "nodejs";

export const GET = editorReadRoute({
  auth: "editor",
  label: "change log",
  read: ({ params, client }) =>
    client.query(api.changelog.getRecent, { limit: Number(requireParam(params, "limit", /^[1-9][0-9]{0,3}$/)) }),
});
