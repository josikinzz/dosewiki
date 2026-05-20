import type { MetadataRoute } from "next";
import { buildRobotsPolicy } from "@server/next/statusRedirectPolicy";

export default function robots(): MetadataRoute.Robots {
  return buildRobotsPolicy();
}
