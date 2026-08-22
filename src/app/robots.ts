import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isEditorHost, isPublicConstructionHost } from "@server/next/publicConstructionPolicy";
import { buildRobotsPolicy } from "@server/next/statusRedirectPolicy";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  return buildRobotsPolicy({
    publicConstructionHost: isPublicConstructionHost(host),
    editorHost: isEditorHost(host),
  });
}
