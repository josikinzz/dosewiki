import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveRuntimeEnvContract, runRuntimeEnvPreflight } from "./envContract";

describe("runtime env contract", () => {
  it("resolves local profile with compatibility aliases", () => {
    const contract = resolveRuntimeEnvContract({
      NODE_ENV: "development",
      VITE_CONVEX_URL: "https://dev.convex.cloud",
      CONVEX_ADMIN_KEY: "secret-admin-key",
      ADMIN_PASSWORD: "p_w",
    });

    expect(contract.profile).toBe("local");
    expect(contract.publicBrowserConfig).toEqual({
      convexUrl: "https://dev.convex.cloud",
      sourceEnvVar: "VITE_CONVEX_URL",
    });
    expect(contract.serverWriteConfig).toMatchObject({
      convexUrl: "https://dev.convex.cloud",
      convexUrlSourceEnvVar: "VITE_CONVEX_URL",
      adminKeyConfigured: true,
    });
    expect(contract.authConfig.policy.activeMode).toBe("legacy-credentials");
  });

  it("reports missing preview and production requirements without throwing", () => {
    const diagnostics = runRuntimeEnvPreflight({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_CONVEX_URL: "https://browser.convex.cloud",
    });

    expect(diagnostics.reportOnly).toBe(true);
    expect(diagnostics.status).toBe("error");
    expect(diagnostics.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "serverWriteConfig",
          envVars: ["CONVEX_ADMIN_KEY"],
          severity: "error",
        }),
        expect.objectContaining({
          capability: "authConfig",
          envVars: ["AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"],
          severity: "error",
        }),
      ]),
    );
  });

  it("keeps browser config free of secret values", () => {
    const contract = resolveRuntimeEnvContract({
      NEXT_PUBLIC_CONVEX_URL: "https://browser.convex.cloud",
      CONVEX_ADMIN_KEY: "secret-admin-key",
      AUTH_SECRET: "auth-secret",
      AUTH_GITHUB_SECRET: "github-secret",
    });

    expect(JSON.stringify(contract.publicBrowserConfig)).not.toContain("secret");
    expect(JSON.stringify(contract.diagnostics.convexTargets)).not.toContain("secret-admin-key");
  });

  it("recognizes a complete production profile", () => {
    const contract = resolveRuntimeEnvContract({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      NEXT_PUBLIC_CONVEX_URL: "https://browser.convex.cloud",
      CONVEX_URL: "https://write.convex.cloud",
      CONVEX_PUBLIC_READ_URL: "https://read.convex.cloud",
      CONVEX_ADMIN_KEY: "secret-admin-key",
      AUTH_SECRET: "auth-secret",
      AUTH_GITHUB_ID: "github-id",
      AUTH_GITHUB_SECRET: "github-secret",
    });

    expect(contract.profile).toBe("production");
    expect(contract.diagnostics.issues.filter((candidate) => candidate.severity === "error")).toEqual([]);
    expect(contract.serverReadConfig.sourceEnvVar).toBe("CONVEX_PUBLIC_READ_URL");
    expect(contract.authConfig.policy.activeMode).toBe("github");
  });

  it("keeps env docs aligned with contract variable names", () => {
    const envExample = readFileSync(".env.example", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const requiredDocVars = [
      "NEXT_PUBLIC_CONVEX_URL",
      "VITE_CONVEX_URL",
      "CONVEX_URL",
      "CONVEX_PUBLIC_READ_URL",
      "CONVEX_ADMIN_KEY",
      "AUTH_SECRET",
      "NEXTAUTH_SECRET",
      "AUTH_GITHUB_ID",
      "AUTH_GITHUB_SECRET",
      "GITHUB_ID",
      "GITHUB_SECRET",
      "ENABLE_TEST_ENV",
    ];

    for (const envVar of requiredDocVars) {
      expect(`${envExample}\n${readme}`, `${envVar} should be documented`).toContain(envVar);
    }
  });
});
