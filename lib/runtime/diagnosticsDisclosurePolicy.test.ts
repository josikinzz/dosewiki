import { describe, expect, it } from "vitest";
import { createDiagnosticsDisclosureView, type DiagnosticDisclosureFacts } from "./diagnosticsDisclosurePolicy";
import { getDataRuntimeTargetMatrix } from "../data/runtimeTargets";

const now = new Date("2026-04-27T12:00:00.000Z");

function facts(overrides: Partial<DiagnosticDisclosureFacts> = {}): DiagnosticDisclosureFacts {
  return {
    now,
    production: false,
    testEnvRouteEnabledInProduction: false,
    keyPresence: [
      { name: "DATA_ADMIN_KEY", configured: true, sensitive: true },
      { name: "AUTH_SECRET", configured: true, sensitive: true },
      { name: "OPTIONAL_TOKEN", configured: false, sensitive: true },
    ],
    dataWriteHealth: {
      adminKeyConfigured: true,
      backend: "postgres",
      postgresUrlConfigured: true,
      canSaveToPostgres: true,
      issues: [],
      diagnostics: {
        warnings: [],
        targets: getDataRuntimeTargetMatrix({ DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgres://localhost/dosewiki", DATA_ADMIN_KEY: "admin-key-value" }),
      },
    },
    runtimeEnv: {
      status: "error",
      reportOnly: true,
      issues: [
        {
          severity: "error",
          capability: "authConfig",
          envVars: ["AUTH_SECRET", "NEXTAUTH_SECRET"],
          message: "Missing required production auth configuration.",
        },
      ],
      dataTargets: getDataRuntimeTargetMatrix({ DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgres://localhost/dosewiki", DATA_ADMIN_KEY: "admin-key-value" }),
    },
    ...overrides,
  };
}

describe("diagnostics disclosure policy", () => {
  it("returns a not-found view for public diagnostics", () => {
    const view = createDiagnosticsDisclosureView("public-not-found", facts());

    expect(view).toMatchObject({
      ok: false,
      available: false,
      status: "not-found",
      issues: [],
      checkedAt: "2026-04-27T12:00:00.000Z",
    });
  });

  it("discloses counts to editors without sensitive key names or secret values", () => {
    const view = createDiagnosticsDisclosureView("editor", facts());
    const serialized = JSON.stringify(view);

    expect(view.keysFound).toBe(2);
    expect(view.totalKeys).toBe(3);
    expect(view.keyNames).toBeUndefined();
    expect(view.issueDetails?.[0]).not.toHaveProperty("envVars");
    expect(serialized).not.toContain("admin-key-value");
    expect(serialized).not.toContain("NEXTAUTH_SECRET");
  });

  it("allows admin and build-preflight audiences to see key names but never values", () => {
    for (const audience of ["admin", "build-preflight"] as const) {
      const view = createDiagnosticsDisclosureView(audience, facts());
      const serialized = JSON.stringify(view);

      expect(view.keyNames).toEqual(["DATA_ADMIN_KEY", "AUTH_SECRET", "OPTIONAL_TOKEN"]);
      expect(view.issueDetails?.[0].envVars).toEqual(["AUTH_SECRET", "NEXTAUTH_SECRET"]);
      expect(serialized).not.toContain("admin-key-value");
    }
  });

  it("blocks local-developer diagnostics in production", () => {
    const view = createDiagnosticsDisclosureView(
      "local-developer",
      facts({ production: true, testEnvRouteEnabledInProduction: true }),
    );

    expect(view.available).toBe(false);
    expect(view.status).toBe("not-found");
  });

  it("keeps build preflight available in production and preserves issue severity", () => {
    const view = createDiagnosticsDisclosureView(
      "build-preflight",
      facts({ production: true, testEnvRouteEnabledInProduction: false }),
    );

    expect(view.available).toBe(true);
    expect(view.status).toBe("error");
    expect(view.issueDetails).toContainEqual(
      expect.objectContaining({
        severity: "error",
        capability: "authConfig",
      }),
    );
  });
});
