import type { MetadataRoute } from "next";
import { buildSiteManifest } from "@server/next/siteManifest";

// Replaces the former static public/manifest.webmanifest. Next serves this route at the
// same "/manifest.webmanifest" path, so the <link rel="manifest"> in the root layout and
// the construction-mode bypass list keep matching.
export default function manifest(): MetadataRoute.Manifest {
  return buildSiteManifest();
}
