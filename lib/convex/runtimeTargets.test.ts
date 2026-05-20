import { describe, expect, it } from "vitest";
import {
  getAuthMembershipTarget,
  getConvexRuntimeTargetMatrix,
  getEditorBrowserReadTarget,
  getPrivilegedWriteTarget,
  getPublicServerReadTarget,
} from "./runtimeTargets";

describe("Convex runtime targets", () => {
  it("resolves capability-specific URL precedence", () => {
    const env = {
      CONVEX_PUBLIC_READ_URL: "https://read.convex.cloud",
      CONVEX_URL: "https://write.convex.cloud",
      VITE_CONVEX_URL: "https://vite.convex.cloud",
      NEXT_PUBLIC_CONVEX_URL: "https://next-public.convex.cloud",
    };

    expect(getPublicServerReadTarget(env)).toMatchObject({
      selectedUrl: "https://read.convex.cloud",
      sourceEnvVar: "CONVEX_PUBLIC_READ_URL",
      browserSafe: false,
    });
    expect(getEditorBrowserReadTarget(env)).toMatchObject({
      selectedUrl: "https://next-public.convex.cloud",
      sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL",
      browserSafe: true,
    });
    expect(getPrivilegedWriteTarget(env)).toMatchObject({
      selectedUrl: "https://write.convex.cloud",
      sourceEnvVar: "CONVEX_URL",
      browserSafe: false,
    });
    expect(getAuthMembershipTarget(env)).toMatchObject({
      selectedUrl: "https://write.convex.cloud",
      sourceEnvVar: "CONVEX_URL",
      browserSafe: false,
    });
  });

  it("preserves compatibility fallback while warning on public write target usage", () => {
    const target = getPrivilegedWriteTarget({
      NODE_ENV: "production",
      NEXT_PUBLIC_CONVEX_URL: "https://browser.convex.cloud",
    });

    expect(target.selectedUrl).toBe("https://browser.convex.cloud");
    expect(target.sourceEnvVar).toBe("NEXT_PUBLIC_CONVEX_URL");
    expect(target.compatibility.allowed).toBe(true);
    expect(target.compatibility.warnings).toEqual([
      "Privileged Convex writes are falling back to NEXT_PUBLIC_CONVEX_URL. Set CONVEX_URL explicitly for server writes.",
      "Production privileged writes are using a browser-exposed Convex URL fallback in compatibility mode.",
    ]);
  });

  it("reports a diagnostics matrix without secret values", () => {
    const matrix = getConvexRuntimeTargetMatrix({
      CONVEX_ADMIN_KEY: "secret-admin-key",
      CONVEX_URL: "https://write.convex.cloud",
    });

    expect(matrix.adminKeyConfigured).toBe(true);
    expect(matrix.privilegedWrite.selectedUrl).toBe("https://write.convex.cloud");
    expect(JSON.stringify(matrix)).not.toContain("secret-admin-key");
  });
});
