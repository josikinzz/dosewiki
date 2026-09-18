import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isEditorHost } from "@server/next/publicHostPolicy";
import { buildSitemapEntries } from "@server/next/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  // The editor deployment mirrors the application for authenticated work but must never
  // publish an indexable sitemap.
  if (isEditorHost(host)) {
    return [];
  }

  return await buildSitemapEntries();
}
