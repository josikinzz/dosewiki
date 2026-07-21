import { describe, expect, it } from "vitest";

import { assertExplicitCitationPromotionTarget } from "./citation-target-policy.mjs";

function context(overrides = {}) {
  return {
    targetUrl: "https://glad-minnow-656.convex.cloud",
    targetUrlKey: "TARGET_CONVEX_URL",
    deploymentFingerprint: "glad-minnow-656",
    expectedDeployment: "glad-minnow-656",
    ...overrides,
  };
}

describe("citation promotion target policy", () => {
  it("accepts an explicit deployment-pinned target", () => {
    expect(assertExplicitCitationPromotionTarget(context())).toBe("https://glad-minnow-656.convex.cloud");
  });

  it("rejects browser/default URL fallbacks even for dry-runs", () => {
    expect(() => assertExplicitCitationPromotionTarget(context({ targetUrlKey: "VITE_CONVEX_URL" })))
      .toThrow(/requires TARGET_CONVEX_URL/);
  });

  it("requires a matching expected deployment for every promotion plan", () => {
    expect(() => assertExplicitCitationPromotionTarget(context({ expectedDeployment: null })))
      .toThrow(/--expected-deployment=glad-minnow-656/);
    expect(() => assertExplicitCitationPromotionTarget(context({ expectedDeployment: "other" })))
      .toThrow(/does not match citation target/);
  });
});
