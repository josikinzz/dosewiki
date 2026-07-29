import { describe, expect, it } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { buildHomeQuickLinks } from "./homeQuickLinks";

describe("buildHomeQuickLinks", () => {
  it("keeps dose.wiki's homepage quick links exactly as they shipped", () => {
    expect(buildHomeQuickLinks(SITE_FLAVOR_CONFIGS.dosewiki).map(({ href, label }) => [href, label]))
      .toEqual([
        ["/substances", "Substances"],
        ["/effects", "Effects"],
        ["/reports", "Reports"],
        ["/about", "About"],
      ]);
  });

  it("leads with Effects on Effect Index and drops nothing from the longer list", () => {
    const links = buildHomeQuickLinks(SITE_FLAVOR_CONFIGS.effectindex);

    expect(links.map((link) => link.label)).toEqual([
      "Effects",
      "Replications",
      "Reports",
      "Substances",
      "About",
    ]);
    expect(links).toHaveLength(SITE_FLAVOR_CONFIGS.effectindex.quickLinkIds.length);
  });

  it("gives every quick link an icon and a matching id", () => {
    for (const config of Object.values(SITE_FLAVOR_CONFIGS)) {
      const links = buildHomeQuickLinks(config);

      expect(links.map((link) => link.id)).toEqual([...config.quickLinkIds]);
      for (const link of links) {
        expect(link.icon).toBeTruthy();
        expect(link.href.startsWith("/")).toBe(true);
      }
    }
  });
});
