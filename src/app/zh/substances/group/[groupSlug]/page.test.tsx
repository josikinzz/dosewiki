import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSubstancesIndexMetadata: vi.fn(),
  setRequestLocale: vi.fn(),
  substancesIndexRoute: vi.fn(),
}));

vi.mock("@/i18n/server", () => ({
  setRequestLocale: mocks.setRequestLocale,
}));
vi.mock("../../../../substances/_components/SubstancesIndexRoute", () => ({
  getSubstancesIndexMetadata: mocks.getSubstancesIndexMetadata,
  SubstancesIndexRoute: mocks.substancesIndexRoute,
}));

import { generateStaticParams } from "./page";

describe("zh substance group route", () => {

  it("prebuilds every supported substance category path", () => {
    expect(generateStaticParams()).toEqual(
      expect.arrayContaining([
        { groupSlug: "hallucinogens" },
        { groupSlug: "stimulant" },
        { groupSlug: "opioid" },
        { groupSlug: "antipsychotic" },
      ]),
    );
  });
});
