import { describe, expect, it } from "vitest";
import {
  getAuthMembershipTarget,
  getConvexDeploymentName,
  getConvexRuntimeTargetMatrix,
  getEditorBrowserReadTarget,
  getEditorTargetAlignment,
  getPrivilegedWriteTarget,
  getPublicServerReadTarget,
} from "./runtimeTargets";

const DEV = "https://enchanted-echidna-791.convex.cloud";
const PROD = "https://glad-minnow-656.convex.cloud";

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

describe("editor read/write deployment alignment", () => {
  const cases: Array<{
    name: string;
    env: Record<string, string | undefined>;
    status: string;
    read: string | null;
    write: string | null;
  }> = [
    {
      // The admin host, configured correctly.
      name: "one deployment for both chains",
      env: { CONVEX_URL: PROD, NEXT_PUBLIC_CONVEX_URL: PROD },
      status: "aligned",
      read: "glad-minnow-656",
      write: "glad-minnow-656",
    },
    {
      // The local `.env.local` shape: one variable feeds both chains.
      name: "VITE_CONVEX_URL alone feeding both chains",
      env: { VITE_CONVEX_URL: DEV },
      status: "aligned",
      read: "enchanted-echidna-791",
      write: "enchanted-echidna-791",
    },
    {
      // The hazard: the local shape plus one variable.
      name: "browser reads prod while writes fall back to dev",
      env: { NEXT_PUBLIC_CONVEX_URL: PROD, VITE_CONVEX_URL: DEV },
      status: "split",
      read: "glad-minnow-656",
      write: "enchanted-echidna-791",
    },
    {
      name: "explicit CONVEX_URL pointing away from the browser target",
      env: { CONVEX_URL: DEV, NEXT_PUBLIC_CONVEX_URL: PROD },
      status: "split",
      read: "glad-minnow-656",
      write: "enchanted-echidna-791",
    },
    {
      // Effect Index: prod reads, no CONVEX_URL, no admin key. The write chain
      // still falls back to NEXT_PUBLIC_CONVEX_URL, which is the same
      // deployment, so this is aligned rather than split.
      name: "read-only publication deployment (Effect Index)",
      env: { CONVEX_PUBLIC_READ_URL: PROD, NEXT_PUBLIC_CONVEX_URL: PROD },
      status: "aligned",
      read: "glad-minnow-656",
      write: "glad-minnow-656",
    },
    {
      // The stricter read-only posture: nothing at all in the write chain.
      name: "no write target configured at all",
      env: { CONVEX_PUBLIC_READ_URL: PROD },
      status: "no-write-target",
      read: null,
      write: null,
    },
    {
      name: "no browser read target",
      env: { CONVEX_URL: PROD },
      status: "no-read-target",
      read: null,
      write: "glad-minnow-656",
    },
  ];

  for (const testCase of cases) {
    it(`reports ${testCase.status} for ${testCase.name}`, () => {
      const alignment = getEditorTargetAlignment(testCase.env);

      expect(alignment.status).toBe(testCase.status);
      expect(alignment.read.deploymentName).toBe(testCase.read);
      expect(alignment.write.deploymentName).toBe(testCase.write);
    });
  }

  it("names both deployments in the split summary and leaks no URL", () => {
    const alignment = getEditorTargetAlignment({
      NEXT_PUBLIC_CONVEX_URL: PROD,
      VITE_CONVEX_URL: DEV,
      CONVEX_ADMIN_KEY: "secret-admin-key",
    });

    expect(alignment.summary).toContain("glad-minnow-656");
    expect(alignment.summary).toContain("enchanted-echidna-791");
    expect(alignment.summary).not.toContain("convex.cloud");
    expect(alignment.summary).not.toContain("secret-admin-key");
    expect(alignment.overrideAcknowledged).toBe(false);
  });

  it("acknowledges an explicit operator override without changing the status", () => {
    const env = { NEXT_PUBLIC_CONVEX_URL: PROD, VITE_CONVEX_URL: DEV };

    expect(getEditorTargetAlignment({ ...env, CONVEX_ALLOW_TARGET_SPLIT: "1" })).toMatchObject({
      status: "split",
      overrideAcknowledged: true,
    });
    expect(getEditorTargetAlignment({ ...env, CONVEX_ALLOW_TARGET_SPLIT: "true" }).overrideAcknowledged).toBe(true);
    expect(getEditorTargetAlignment({ ...env, CONVEX_ALLOW_TARGET_SPLIT: "0" }).overrideAcknowledged).toBe(false);
    expect(getEditorTargetAlignment({ ...env, CONVEX_ALLOW_TARGET_SPLIT: "" }).overrideAcknowledged).toBe(false);
  });

  it("does not read an unparsable URL as aligned with a different one", () => {
    expect(
      getEditorTargetAlignment({ NEXT_PUBLIC_CONVEX_URL: "not-a-url", CONVEX_URL: PROD }).status,
    ).toBe("split");
    expect(
      getEditorTargetAlignment({ NEXT_PUBLIC_CONVEX_URL: "not-a-url", VITE_CONVEX_URL: "not-a-url" }).status,
    ).toBe("aligned");
  });

  it("surfaces the alignment on the diagnostics matrix", () => {
    const matrix = getConvexRuntimeTargetMatrix({
      NEXT_PUBLIC_CONVEX_URL: PROD,
      VITE_CONVEX_URL: DEV,
    });

    expect(matrix.editorTargetAlignment.status).toBe("split");
  });

  it("extracts the deployment name from a Convex URL", () => {
    expect(getConvexDeploymentName(PROD)).toBe("glad-minnow-656");
    expect(getConvexDeploymentName("https://glad-minnow-656.convex.site")).toBe("glad-minnow-656");
    expect(getConvexDeploymentName(null)).toBeNull();
    expect(getConvexDeploymentName("not-a-url")).toBeNull();
  });
});
