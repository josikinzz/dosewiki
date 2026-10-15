import { api } from "@server/postgres/runtime/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

export const GET = editorReadRoute({
  auth: "admin",
  label: "banner display settings",
  read: ({ client }) => client.query(api.siteConfig.getBannerDisplay, {}),
});
