import type { MetadataRoute } from "next";
import { buildSitemapEntries } from "@server/next/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return await buildSitemapEntries();
}
