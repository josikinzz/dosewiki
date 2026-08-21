import { describe, expect, it } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import {
  balancedQuickLinkRowSizes,
  buildHomeQuickLinks,
  partitionQuickLinkRows,
} from "./homeQuickLinks";

describe("buildHomeQuickLinks", () => {
  it("runs dose.wiki's homepage quick links in the declared section order", () => {
    expect(buildHomeQuickLinks(SITE_FLAVOR_CONFIGS.dosewiki).map(({ href, label }) => [href, label]))
      .toEqual([
        ["/substances", "Substances"],
        ["/effects", "Effects"],
        ["/reports", "Reports"],
        ["/replications", "Replications"],
        ["/about", "About"],
      ]);
  });

  it("leads with Effects on Effect Index and leaves Substances off the tile grid", () => {
    const links = buildHomeQuickLinks(SITE_FLAVOR_CONFIGS.effectindex);

    expect(links.map((link) => link.label)).toEqual([
      "Effects",
      "Replications",
      "Reports",
      "About",
    ]);
    // The original site advertised no Substances section; the header has since gained a
    // Substances link, but the tile grid still omits it. `/substances` itself stays live.
    expect(links.map((link) => link.id)).not.toContain("substances");
    expect(links.map((link) => link.href)).not.toContain("/substances");
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

describe("balancedQuickLinkRowSizes", () => {
  it("splits n tiles into ceil(n/3) balanced rows, wider rows first", () => {
    const expected: Record<number, number[]> = {
      1: [1],
      2: [2],
      3: [3],
      4: [2, 2],
      5: [3, 2],
      6: [3, 3],
      7: [3, 2, 2],
      8: [3, 3, 2],
      9: [3, 3, 3],
      10: [3, 3, 2, 2],
    };
    for (let n = 1; n <= 10; n += 1) {
      expect(balancedQuickLinkRowSizes(n), `n=${n}`).toEqual(expected[n]);
    }
  });

  it("returns no rows for an empty grid", () => {
    expect(balancedQuickLinkRowSizes(0)).toEqual([]);
    expect(balancedQuickLinkRowSizes(-1)).toEqual([]);
  });
});

describe("partitionQuickLinkRows", () => {
  it("chunks items into the balanced row sizes without reordering or dropping any", () => {
    for (let n = 1; n <= 10; n += 1) {
      const items = Array.from({ length: n }, (_, index) => index);
      const rows = partitionQuickLinkRows(items);

      expect(rows.map((row) => row.length)).toEqual(balancedQuickLinkRowSizes(n));
      expect(rows.flat()).toEqual(items);
    }
  });

  it("partitions both flavors' quick links completely", () => {
    for (const config of Object.values(SITE_FLAVOR_CONFIGS)) {
      const links = buildHomeQuickLinks(config);

      expect(partitionQuickLinkRows(links).flat()).toEqual([...links]);
    }
  });
});
