import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isEditorHost, isPublicConstructionHost } from "@server/next/publicConstructionPolicy";
import { buildSitemapEntries } from "@server/next/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  // Neither the gated public hosts nor the working deployment publishes a map of itself:
  // one has a single page worth reaching, the other is closed to crawlers entirely.
  if (isPublicConstructionHost(host) || isEditorHost(host)) {
    return [];
  }

  return await buildSitemapEntries();
}
