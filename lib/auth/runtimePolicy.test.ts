import { describe, expect, it } from "vitest";
import { resolveAuthRuntimePolicy } from "./runtimePolicy";

describe("resolveAuthRuntimePolicy", () => {
  it("does not fall back to the development secret outside development", () => {
    const policy = resolveAuthRuntimePolicy({ NODE_ENV: "production", VERCEL_ENV: "preview" });

    expect(policy.deploymentTarget).toBe("preview");
    expect(policy.authSecret).toBeUndefined();
    expect(policy.authSecretSource).toBe("missing");
    expect(policy.sessionsAvailable).toBe(false);
    expect(policy.requiredSecrets).toEqual(["AUTH_SECRET"]);
    expect(policy.restrictions).toEqual(["AUTH_SECRET is required before Auth.js can issue sessions."]);
  });
});
