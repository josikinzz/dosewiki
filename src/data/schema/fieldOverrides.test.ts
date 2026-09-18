import { describe, expect, it } from "vitest";

import { FIELD_OVERRIDES } from "./fieldOverrides";
import { mergeFieldOverrideModules } from "./fieldOverrides/shared";

describe("FIELD_OVERRIDES", () => {
  it("keeps the public override registry populated", () => {
    expect(FIELD_OVERRIDES["identification.common_name"]?.label).toBe("Common Name");
    expect(FIELD_OVERRIDES["legality.countries"]?.section).toBe("legality");
    expect(FIELD_OVERRIDES["citations"]?.type).toBe("citation");
    expect(FIELD_OVERRIDES["references"]?.type).toBe("reference");
    expect(FIELD_OVERRIDES["dosage.routes[].reference_ids"]?.routeDependent).toBe(true);
  });

  it("rejects duplicate field paths when composing modules", () => {
    expect(() =>
      mergeFieldOverrideModules([
        { name: "one", overrides: { title: { label: "Title", section: "meta" } } },
        { name: "two", overrides: { title: { label: "Duplicate", section: "meta" } } },
      ]),
    ).toThrow(/Duplicate field override/);
  });
});
