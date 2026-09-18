import { describe, expect, it } from "vitest";
import { resolveRuntimeEnvContract, runRuntimeEnvPreflight } from "./envContract";

describe("runtime env contract", () => {
  it("resolves Postgres and same-origin browser access without legacy URLs", () => {
    const contract = resolveRuntimeEnvContract({
      NODE_ENV: "development", DATA_BACKEND: "postgres",
      POSTGRES_POOLED_URL: "postgres://localhost/dosewiki", DATA_ADMIN_KEY: "secret-admin-key",
    });
    expect(contract.publicBrowserConfig).toEqual({ transport: "same-origin" });
    expect(contract.serverWriteConfig).toMatchObject({ postgresUrl: "postgres://localhost/dosewiki", adminKeyConfigured: true });
    expect(contract.diagnostics.issues.filter((candidate) => candidate.severity === "error")).toEqual([]);
  });

  it("reports missing preview and production requirements without throwing", () => {
    const diagnostics = runRuntimeEnvPreflight({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    });

    expect(diagnostics.reportOnly).toBe(true);
    expect(diagnostics.status).toBe("error");
    expect(diagnostics.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "serverWriteConfig",
          envVars: ["DATA_ADMIN_KEY"],
          severity: "error",
        }),
        expect.objectContaining({
          capability: "authConfig",
          envVars: ["AUTH_SECRET"],
          severity: "error",
        }),
      ]),
    );
  });

  it("keeps browser config free of secret values", () => {
    const contract = resolveRuntimeEnvContract({
      DATA_BACKEND: "postgres",
      POSTGRES_POOLED_URL: "postgres://secret-user:secret-password@localhost/dosewiki",
      DATA_ADMIN_KEY: "secret-admin-key",
      AUTH_SECRET: "auth-secret",
    });

    expect(JSON.stringify(contract.publicBrowserConfig)).not.toContain("secret");
    expect(JSON.stringify(contract.diagnostics.dataTargets)).not.toContain("secret");
  });

  it("recognizes a complete production profile", () => {
    const contract = resolveRuntimeEnvContract({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      DATA_BACKEND: "postgres",
      POSTGRES_POOLED_URL: "postgres://localhost/dosewiki",
      DATA_ADMIN_KEY: "secret-admin-key",
      AUTH_SECRET: "auth-secret",
    });

    expect(contract.profile).toBe("production");
    expect(contract.diagnostics.issues.filter((candidate) => candidate.severity === "error")).toEqual([]);
    expect(contract.serverReadConfig.sourceEnvVar).toBe("POSTGRES_POOLED_URL");
    expect(contract.authConfig.policy.sessionsAvailable).toBe(true);
  });

});
