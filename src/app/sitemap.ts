import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isPublicConstructionHost } from "@server/next/publicConstructionPolicy";
import { buildSitemapEntries } from "@server/next/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  if (isPublicConstructionHost(requestHeaders.get("host"))) {
    return [];
  }

  return await buildSitemapEntries();
}
