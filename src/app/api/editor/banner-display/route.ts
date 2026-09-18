/** The site-wide safety-banner glyph size, read by the Banner Studio toolbar. */
import { api } from "@server/postgres/runtime/api";
import { editorReadRoute } from "../editorReadRoute";

export const runtime = "nodejs";

/** GET /api/editor/banner-display -> siteConfig.getBannerDisplay */
export const GET = editorReadRoute({
  auth: "admin",
  label: "banner display settings",
  read: ({ client }) => client.query(api.siteConfig.getBannerDisplay, {}),
});
