import { describe, expect, it } from "vitest";
import { LICENSES, isModifiedDerivative, planLicenseUpdates } from "./apply-artist-license.mjs";

const CC_BY_SA = LICENSES["cc-by-sa-4.0"];

const make = (overrides = {}) => ({
  slug: "tree-bark-chelsea-morgan",
  title: "Tree Bark",
  artist: "Chelsea Morgan",
  credit_line: "Tree Bark by Chelsea Morgan",
  rights_status: "unknown",
  ...overrides,
});

describe("isModifiedDerivative", () => {
  it("detects upscaler markers in the slug", () => {
    expect(
      isModifiedDerivative(make({ slug: "double_vision-chelsea-morgan_upscayl_4x_realesrgan-x4plus" })),
    ).toBe(true);
    expect(isModifiedDerivative(make({ slug: "asphalt_photos_v2_x2-unknown" }))).toBe(true);
  });

  it("leaves untouched originals alone", () => {
    expect(isModifiedDerivative(make())).toBe(false);
  });
});

describe("planLicenseUpdates", () => {
  it("selects only the named artist, matching case-insensitively", () => {
    const plan = planLicenseUpdates(
      [make(), make({ slug: "other", artist: "chelsea morgan" }), make({ slug: "x", artist: "Luke Brown" })],
      { artist: "Chelsea Morgan", license: CC_BY_SA },
    );

    expect(plan.map((entry) => entry.slug).sort()).toEqual(["other", "tree-bark-chelsea-morgan"]);
  });

  it("records the licence, its URL, and an explicit rights status", () => {
    const [entry] = planLicenseUpdates([make()], { artist: "Chelsea Morgan", license: CC_BY_SA });

    expect(entry.updates).toMatchObject({
      rights_status: "explicit-license",
      license_name: "CC BY-SA 4.0",
      license_url: "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
      rightsholder: "Chelsea Morgan",
    });
  });

  it("appends a modification notice to derivatives, as share-alike requires", () => {
    const [entry] = planLicenseUpdates(
      [make({ slug: "double_vision-chelsea-morgan_upscayl_4x_realesrgan-x4plus" })],
      { artist: "Chelsea Morgan", license: CC_BY_SA },
    );

    expect(entry.modified).toBe(true);
    expect(entry.updates.credit_line).toBe(
      "Tree Bark by Chelsea Morgan. Modified from the original (upscaled).",
    );
  });

  it("does not append the notice twice on a re-run", () => {
    const already = make({
      slug: "x_upscayl_4x",
      credit_line: "Tree Bark by Chelsea Morgan. Modified from the original (upscaled).",
    });
    const [entry] = planLicenseUpdates([already], { artist: "Chelsea Morgan", license: CC_BY_SA });

    expect(entry.updates.credit_line).toBe(already.credit_line);
  });

  it("adds no modification notice for a licence that does not require one", () => {
    const [entry] = planLicenseUpdates([make({ slug: "x_upscayl_4x" })], {
      artist: "Chelsea Morgan",
      license: LICENSES["cc0-1.0"],
    });

    expect(entry.updates.credit_line).toBe("Tree Bark by Chelsea Morgan");
  });

  it("marks rows that already carry the licence as unchanged", () => {
    const licensed = make({
      rights_status: "explicit-license",
      license_name: "CC BY-SA 4.0",
      license_url: "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
      rightsholder: "Chelsea Morgan",
    });
    const [entry] = planLicenseUpdates([licensed], { artist: "Chelsea Morgan", license: CC_BY_SA });

    expect(entry.unchanged).toBe(true);
  });

  it("synthesises a credit line when the row has none", () => {
    const [entry] = planLicenseUpdates([make({ credit_line: undefined })], {
      artist: "Chelsea Morgan",
      license: CC_BY_SA,
    });

    expect(entry.updates.credit_line).toBe("Tree Bark by Chelsea Morgan");
  });
});
