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
      clientId: "github-id",
      clientSecret: "github-secret",
    });
  });

  it("makes local legacy credentials explicit when GitHub is absent", () => {
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

  it("prefers GitHub over local legacy credentials", () => {
    const policy = resolveAuthRuntimePolicy({
      NODE_ENV: "development",
      AUTH_GITHUB_ID: "github-id",
      AUTH_GITHUB_SECRET: "github-secret",
      ADMIN_PASSWORD: "p_w",
    });

    expect(policy.activeMode).toBe("github");
    expect(policy.providers).toEqual(["github"]);
    expect(policy.legacyCredentials.reason).toBe("github-configured");
  });

  it("does not expose legacy credentials in preview or production", () => {
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
      reason: "not-development",
    });
    expect(policy.restrictions).toContain("Legacy credentials are ignored outside local development.");
  });

  it("reports preview and production required secrets without hard-blocking callers", () => {
    const policy = resolveAuthRuntimePolicy({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    });

    expect(policy.deploymentTarget).toBe("production");
    expect(policy.activeMode).toBe("disabled");
    expect(policy.requiredSecrets).toEqual(["AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"]);
    expect(policy.authSecret).toBeUndefined();
  });
});
