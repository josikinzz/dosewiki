import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isPublicConstructionHost } from "@server/next/publicConstructionPolicy";
import { buildRobotsPolicy } from "@server/next/statusRedirectPolicy";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  return buildRobotsPolicy({
    publicConstructionHost: isPublicConstructionHost(requestHeaders.get("host")),
  });
}
