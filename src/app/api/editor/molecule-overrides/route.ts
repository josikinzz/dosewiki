/**
 * Canonical molecule depictions, as the molecule editor and review workbench read them.
 *
 *   GET /api/editor/molecule-overrides                          -> moleculeOverrides.listSlugs
 *   GET /api/editor/molecule-overrides?slug=lsd                 -> moleculeOverrides.getBySlug (null when none)
 *   GET /api/editor/molecule-overrides?slug=lsd&scope=metadata  -> moleculeOverrides.getMetadataBySlug
 */
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { editorReadRoute, requireParam } from "../editorReadRoute";

export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9:_-]*$/i;

export const GET = editorReadRoute({
  auth: "editor",
  label: "molecule depictions",
  read: ({ params, client }) => {
    if (!params.has("slug")) return client.query(api.moleculeOverrides.listSlugs, {});
    const slug = requireParam(params, "slug", SLUG_PATTERN);
    const scope = params.get("scope") ?? "document";
    if (scope === "metadata") return client.query(api.moleculeOverrides.getMetadataBySlug, { slug });
    if (scope !== "document") throw new JsonBodyError(400, "A supported scope is required.");
    return client.query(api.moleculeOverrides.getBySlug, { slug });
  },
});
