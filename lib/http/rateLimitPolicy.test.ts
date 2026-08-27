import { describe, expect, it } from "vitest";
import { rateLimitPolicies, type RateLimitPolicyName } from "./rateLimitPolicy";

const expectedPolicies: Record<RateLimitPolicyName, { windowMs: number; max: number }> = {
  editorHeavyWrite: { windowMs: 60_000, max: 5 },
  editorSmallWrite: { windowMs: 60_000, max: 20 },
  authenticatedProfileWrite: { windowMs: 60_000, max: 5 },
  publicTripReportSubmit: { windowMs: 60_000, max: 4 },
  publicArticleFeedbackSubmit: { windowMs: 60_000, max: 3 },
  publicSiteFeedbackSubmit: { windowMs: 60_000, max: 3 },
  publicProxyRead: { windowMs: 60_000, max: 30 },
  diagnosticRead: { windowMs: 60_000, max: 30 },
  publicSearchRead: { windowMs: 60_000, max: 30 },
  publicContentApiRead: { windowMs: 60_000, max: 120 },
  authCredentialAttempt: { windowMs: 600_000, max: 10 },
};

describe("rate limit policies", () => {
  it("preserves named policy limits, keying, response shape, and fallback mode", () => {
    for (const [name, expected] of Object.entries(expectedPolicies) as Array<
      [RateLimitPolicyName, { windowMs: number; max: number }]
    >) {
      expect(rateLimitPolicies[name]).toMatchObject({
        name,
        windowMs: expected.windowMs,
        max: expected.max,
        keyStrategy: "ip",
        fallbackMode: "inMemory",
        responseShape: "jsonError",
      });
    }
  });
});
