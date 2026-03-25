import { describe, expect, it } from "vitest";
import { getOrganSystemIcon } from "./ToxicitySubsection";

describe("getOrganSystemIcon", () => {
  it("uses the lungs icon for respiratory system cards", () => {
    expect(getOrganSystemIcon("Respiratory System")).toBe("tabler:lungs");
  });

  it("normalizes respiratory system casing and whitespace", () => {
    expect(getOrganSystemIcon(" respiratory system ")).toBe("tabler:lungs");
  });

  it("falls back to the generic organ icon for unknown systems", () => {
    expect(getOrganSystemIcon("Unknown System")).toBe("healthicons:organ-outline");
  });
});
