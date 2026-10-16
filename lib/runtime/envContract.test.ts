import { describe, expect, it } from "vitest";
import { resolveRuntimeEnvContract } from "./envContract";

describe("runtime env contract", () => {
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
});
