import { describe, expect, it } from "vitest";
import { DEVELOPMENT_AUTH_SECRET, resolveAuthRuntimePolicy } from "./runtimePolicy";

describe("resolveAuthRuntimePolicy", () => {
  it("uses the shared development Auth.js secret fallback", () => {
    const policy = resolveAuthRuntimePolicy({ NODE_ENV: "development" });

    expect(policy.authSecret).toBe(DEVELOPMENT_AUTH_SECRET);
    expect(policy.authSecretSource).toBe("development-fallback");
    expect(policy.sessionsAvailable).toBe(true);
    expect(policy.requiredSecrets).toEqual([]);
  });

  it("keeps AUTH_SECRET and NEXTAUTH_SECRET aliases", () => {
    expect(resolveAuthRuntimePolicy({ AUTH_SECRET: "auth-secret" })).toMatchObject({
      authSecret: "auth-secret",
      authSecretSource: "AUTH_SECRET",
    });
    expect(resolveAuthRuntimePolicy({ NEXTAUTH_SECRET: "nextauth-secret" })).toMatchObject({
      authSecret: "nextauth-secret",
      authSecretSource: "NEXTAUTH_SECRET",
    });
  });

  it("does not fall back to the development secret outside development", () => {
    const policy = resolveAuthRuntimePolicy({ NODE_ENV: "production", VERCEL_ENV: "preview" });

    expect(policy.deploymentTarget).toBe("preview");
    expect(policy.authSecret).toBeUndefined();
    expect(policy.authSecretSource).toBe("missing");
    expect(policy.sessionsAvailable).toBe(false);
    expect(policy.requiredSecrets).toEqual(["AUTH_SECRET"]);
    expect(policy.restrictions).toEqual(["AUTH_SECRET is required before Auth.js can issue sessions."]);
  });

  it("reports a production target from NODE_ENV when VERCEL_ENV is absent", () => {
    const policy = resolveAuthRuntimePolicy({ NODE_ENV: "production", AUTH_SECRET: "auth-secret" });

    expect(policy.deploymentTarget).toBe("production");
    expect(policy.sessionsAvailable).toBe(true);
    expect(policy.requiredSecrets).toEqual([]);
  });
});
