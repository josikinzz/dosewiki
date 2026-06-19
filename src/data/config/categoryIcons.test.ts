import { describe, expect, it } from "vitest";

import { DEFAULT_CATEGORY_ICON, getCategoryIcon } from "./categoryIcons";

describe("getCategoryIcon", () => {
  it("resolves opioid aliases to the configured warning icon", () => {
    expect(getCategoryIcon("opioid")).toBe("mynaui:danger-hexagon");
    expect(getCategoryIcon("opioids")).toBe("mynaui:danger-hexagon");
  });

  it("passes through direct Iconify identifiers from stored layouts", () => {
    expect(getCategoryIcon("mynaui:danger-hexagon")).toBe("mynaui:danger-hexagon");
  });

  it("falls back for unknown symbolic keys", () => {
    expect(getCategoryIcon("unknown-category")).toBe(DEFAULT_CATEGORY_ICON);
  });
});
