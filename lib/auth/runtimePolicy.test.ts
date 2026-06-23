import { describe, expect, it } from "vitest";
import { DEVELOPMENT_AUTH_SECRET, resolveAuthRuntimePolicy } from "./runtimePolicy";

describe("resolveAuthRuntimePolicy", () => {
  it("uses the shared development Auth.js secret fallback", () => {
    const policy = resolveAuthRuntimePolicy({ NODE_ENV: "development" });

    expect(policy.authSecret).toBe(DEVELOPMENT_AUTH_SECRET);
    expect(policy.authSecretSource).toBe("development-fallback");
  });

  it("keeps AUTH_SECRET and NEXTAUTH_SECRET aliases", () => {
    expect(resolveAuthRuntimePolicy({ AUTH_SECRET: "auth-secret" }).authSecret).toBe("auth-secret");
    expect(resolveAuthRuntimePolicy({ NEXTAUTH_SECRET: "nextauth-secret" }).authSecret).toBe("nextauth-secret");
  });

  it("resolves GitHub provider aliases", () => {
    const policy = resolveAuthRuntimePolicy({
      NODE_ENV: "production",
      GITHUB_ID: "github-id",
      GITHUB_SECRET: "github-secret",
      AUTH_SECRET: "auth-secret",
    });

    expect(policy.activeMode).toBe("github");
    expect(policy.providers).toEqual(["github"]);
    expect(policy.github).toMatchObject({
      configured: true,
      available: true,
      clientId: "github-id",
      clientSecret: "github-secret",
    });
  });

  it("makes local editor credentials explicit", () => {
    const policy = resolveAuthRuntimePolicy({
      NODE_ENV: "development",
      ADMIN_PASSWORD: "p_w",
    });

    expect(policy.activeMode).toBe("legacy-credentials");
    expect(policy.providers).toEqual(["credentials"]);
    expect(policy.legacyCredentials).toMatchObject({
      configured: true,
      available: true,
      reason: "available",
    });
  });

  it("allows env credentials in preview and production when AUTH_SECRET is present", () => {
    const policy = resolveAuthRuntimePolicy({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      AUTH_SECRET: "auth-secret",
      ADMIN_PASSWORD: "p_w",
    });

    expect(policy.activeMode).toBe("legacy-credentials");
    expect(policy.providers).toEqual(["credentials"]);
    expect(policy.legacyCredentials).toMatchObject({
      configured: true,
      available: true,
      reason: "available",
    });
  });

  it("requires AUTH_SECRET before enabling production env credentials", () => {
    const policy = resolveAuthRuntimePolicy({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      ADMIN_PASSWORD: "p_w",
    });

    expect(policy.activeMode).toBe("disabled");
    expect(policy.providers).toEqual([]);
    expect(policy.legacyCredentials).toMatchObject({
      configured: true,
      available: false,
      reason: "missing-auth-secret",
    });
    expect(policy.restrictions).toContain("AUTH_SECRET is required before Auth.js providers can issue sessions.");
  });

  it("reports preview and production required secrets without hard-blocking callers", () => {
    const policy = resolveAuthRuntimePolicy({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    });

    expect(policy.deploymentTarget).toBe("production");
    expect(policy.activeMode).toBe("disabled");
    expect(policy.requiredSecrets).toEqual(["AUTH_SECRET", "ADMIN_PASSWORD"]);
    expect(policy.authSecret).toBeUndefined();
  });
});
