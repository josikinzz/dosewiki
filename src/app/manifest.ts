import type { MetadataRoute } from "next";
import { buildSiteManifest } from "@server/next/siteManifest";

export default function manifest(): MetadataRoute.Manifest {
  return buildSiteManifest();
}
