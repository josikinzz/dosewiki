import { describe, expect, it } from "vitest";
import { createDiagnosticsDisclosureView, type DiagnosticDisclosureFacts } from "./diagnosticsDisclosurePolicy";

const now = new Date("2026-04-27T12:00:00.000Z");

function facts(overrides: Partial<DiagnosticDisclosureFacts> = {}): DiagnosticDisclosureFacts {
  return {
    now,
    production: false,
    testEnvRouteEnabledInProduction: false,
    keyPresence: [
      { name: "CONVEX_ADMIN_KEY", configured: true, sensitive: true },
      { name: "AUTH_SECRET", configured: true, sensitive: true },
      { name: "OPTIONAL_TOKEN", configured: false, sensitive: true },
    ],
    convexWriteHealth: {
      adminKeyConfigured: true,
      convexUrlConfigured: true,
      canSaveToConvex: true,
      issues: [],
      diagnostics: {
        warnings: [],
        targets: {
          publicServerRead: {
            capability: "publicServerRead",
            selectedUrl: "https://read.convex.cloud",
            sourceEnvVar: "CONVEX_PUBLIC_READ_URL",
            browserSafe: false,
            compatibility: { allowed: true, issues: [], warnings: [] },
          },
          editorBrowserRead: {
            capability: "editorBrowserRead",
            selectedUrl: "https://browser.convex.cloud",
            sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL",
            browserSafe: true,
            compatibility: { allowed: true, issues: [], warnings: [] },
          },
          privilegedWrite: {
            capability: "privilegedWrite",
            selectedUrl: "https://write.convex.cloud",
            sourceEnvVar: "CONVEX_URL",
            browserSafe: false,
            compatibility: { allowed: true, issues: [], warnings: [] },
          },
          authMembership: {
            capability: "authMembership",
            selectedUrl: "https://write.convex.cloud",
            sourceEnvVar: "CONVEX_URL",
            browserSafe: false,
            compatibility: { allowed: true, issues: [], warnings: [] },
          },
          adminKeyConfigured: true,
        },
      },
    },
    runtimeEnv: {
      status: "error",
      reportOnly: true,
      issues: [
        {
          severity: "error",
          capability: "authConfig",
          envVars: ["AUTH_SECRET", "AUTH_GITHUB_SECRET"],
          message: "Missing required production auth configuration.",
        },
      ],
      convexTargets: {
        publicServerRead: {
          capability: "publicServerRead",
          selectedUrl: "https://read.convex.cloud",
          sourceEnvVar: "CONVEX_PUBLIC_READ_URL",
          browserSafe: false,
          compatibility: { allowed: true, issues: [], warnings: [] },
        },
        editorBrowserRead: {
          capability: "editorBrowserRead",
          selectedUrl: "https://browser.convex.cloud",
          sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL",
          browserSafe: true,
          compatibility: { allowed: true, issues: [], warnings: [] },
        },
        privilegedWrite: {
          capability: "privilegedWrite",
          selectedUrl: "https://write.convex.cloud",
          sourceEnvVar: "CONVEX_URL",
          browserSafe: false,
          compatibility: { allowed: true, issues: [], warnings: [] },
        },
        authMembership: {
          capability: "authMembership",
          selectedUrl: "https://write.convex.cloud",
          sourceEnvVar: "CONVEX_URL",
          browserSafe: false,
          compatibility: { allowed: true, issues: [], warnings: [] },
        },
        adminKeyConfigured: true,
      },
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
    expect(serialized).not.toContain("AUTH_GITHUB_SECRET");
  });

  it("allows admin and build-preflight audiences to see key names but never values", () => {
    for (const audience of ["admin", "build-preflight"] as const) {
      const view = createDiagnosticsDisclosureView(audience, facts());
      const serialized = JSON.stringify(view);

      expect(view.keyNames).toEqual(["CONVEX_ADMIN_KEY", "AUTH_SECRET", "OPTIONAL_TOKEN"]);
      expect(view.issueDetails?.[0].envVars).toEqual(["AUTH_SECRET", "AUTH_GITHUB_SECRET"]);
      expect(serialized).not.toContain("admin-key-value");
      expect(serialized).not.toContain("github-secret-value");
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
