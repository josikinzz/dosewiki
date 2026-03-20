import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dev", "/sign-in", "/unauthorized"],
    },
    sitemap: "https://dose.wiki/sitemap.xml",
  };
}
