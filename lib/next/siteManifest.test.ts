import { describe, expect, it } from "vitest";
import { buildSiteManifest } from "./siteManifest";
import { SITE_FLAVOR_CONFIGS } from "../../src/config/siteFlavor";

describe("web app manifest", () => {
  it("keeps the dose.wiki manifest identical to the static file it replaced", () => {
    expect(buildSiteManifest(SITE_FLAVOR_CONFIGS.dosewiki)).toEqual({
      name: "dose.wiki",
      short_name: "dose.wiki",
      start_url: "/",
      display: "standalone",
      background_color: "#0f0a1f",
      theme_color: "#0f0a1f",
      icons: [
        { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
    });
  });

  it("carries the Effect Index name and icon under the Effect Index flavor", () => {
    expect(buildSiteManifest(SITE_FLAVOR_CONFIGS.effectindex)).toEqual({
      name: "Effect Index",
      short_name: "Effect Index",
      start_url: "/",
      display: "standalone",
      background_color: "#f8f4ea",
      theme_color: "#f8f4ea",
      icons: [{ src: "/effectindex/icon.png", type: "image/png", sizes: "512x512" }],
    });
  });
});
