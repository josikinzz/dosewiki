import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  findRepoRoot,
  getAdminIntentEnvVar,
  loadEnvFiles,
  parseEnvFileContent,
  requireAdminIntentToken,
  resolveAdminIntentToken,
} from "./data-ops-run-context.mjs";

const tmpRoots = [];

async function makeTmpRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-data-ops-"));
  tmpRoots.push(root);
  await writeFile(path.join(root, "package.json"), "{}\n");
  await mkdir(path.join(root, "scripts", "convex"), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("data ops run context", () => {
  it("parses .env.local values without overriding process environment", async () => {
    const root = await makeTmpRepo();
    await writeFile(
      path.join(root, ".env.local"),
      [
        "# local development",
        "VITE_CONVEX_URL=https://dev.convex.cloud",
        "export NEXT_PUBLIC_CONVEX_URL='https://public.convex.cloud'",
        "CONVEX_ADMIN_KEY=\"local-secret\"",
      ].join("\n"),
    );

    const env = { VITE_CONVEX_URL: "https://shell.convex.cloud" };
    const loaded = loadEnvFiles({ rootDir: root, env });

    expect(loaded[".env.local"].CONVEX_ADMIN_KEY).toBe("local-secret");
    expect(env.VITE_CONVEX_URL).toBe("https://shell.convex.cloud");
    expect(env.NEXT_PUBLIC_CONVEX_URL).toBe("https://public.convex.cloud");
    expect(env.CONVEX_ADMIN_KEY).toBe("local-secret");
  });

  it("resolves repo root from a nested script directory", async () => {
    const root = await makeTmpRepo();
    const nested = path.join(root, "scripts", "convex");

    expect(findRepoRoot(nested)).toBe(root);
  });

  it("uses explicit source and target variables before public fallbacks", () => {
    const context = createDataOpsRunContext({
      operation: "copy",
      intent: "cross-deployment-copy",
      argv: [],
      loadsEnvLocal: false,
      env: {
        SOURCE_CONVEX_URL: "https://source.convex.cloud",
        TARGET_CONVEX_URL: "https://target.convex.cloud",
        VITE_CONVEX_URL: "https://dev.convex.cloud",
      },
    });

    expect(context.sourceUrl).toBe("https://source.convex.cloud");
    expect(context.sourceUrlKey).toBe("SOURCE_CONVEX_URL");
    expect(context.targetUrl).toBe("https://target.convex.cloud");
    expect(context.targetUrlKey).toBe("TARGET_CONVEX_URL");
  });

  it("blocks dry-run writes through the shared policy", () => {
    const context = createDataOpsRunContext({
      operation: "local prepopulate",
      intent: "local-prepopulate",
      argv: ["--dry-run"],
      loadsEnvLocal: false,
      env: { VITE_CONVEX_URL: "https://dev.convex.cloud" },
      sourceUrlKeys: [],
      targetUrlKeys: [],
      localArtifacts: ["src/data/SubstanceIndex.json"],
    });

    expect(context.sourceUrl).toBeNull();
    expect(context.targetUrl).toBeNull();
    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/dry-run mode/);
  });

  it("requires destructive production confirmation before writes", () => {
    const context = createDataOpsRunContext({
      operation: "production sync",
      intent: "production-sync",
      argv: ["--tables=prompts"],
      loadsEnvLocal: false,
      env: {
        SOURCE_CONVEX_URL: "https://dev.convex.cloud",
        TARGET_CONVEX_URL: "https://prod.convex.cloud",
      },
      selectedTables: ["prompts"],
      confirmationFlag: "--confirm-production-sync",
      destructive: true,
    });

    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/--confirm-production-sync/);
  });

  it("allows confirmed destructive writes and reports selected tables", () => {
    const context = createDataOpsRunContext({
      operation: "production sync",
      intent: "production-sync",
      argv: ["--tables=prompts", "--confirm-production-sync"],
      loadsEnvLocal: false,
      env: {
        SOURCE_CONVEX_URL: "https://dev.convex.cloud",
        TARGET_CONVEX_URL: "https://prod.convex.cloud",
      },
      selectedTables: ["prompts"],
      confirmationFlag: "--confirm-production-sync",
      destructive: true,
    });

    expect(() => assertDataOpsWriteAllowed(context)).not.toThrow();
    expect(context.selectedTables).toEqual(["prompts"]);
  });

  it("parses bare env content", () => {
    expect(parseEnvFileContent("A=1\nexport B='two'\n# nope\nC=\"three\"\n")).toEqual({
      A: "1",
      B: "two",
      C: "three",
    });
  });

  it("prefers scoped admin intent tokens before the legacy admin key", () => {
    expect(getAdminIntentEnvVar("citationEvidenceWrite")).toBe("CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE");

    expect(resolveAdminIntentToken("citationEvidenceWrite", {
      env: {
        CONVEX_ADMIN_KEY: "legacy-secret",
        CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE: "citation-secret",
      },
    })).toEqual({
      token: "citation-secret",
      source: "scoped",
      envVar: "CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE",
    });
  });

  it("falls back to the legacy admin key for admin intents when no scoped token exists", () => {
    expect(requireAdminIntentToken("citationEvidenceReview", {
      env: {
        CONVEX_ADMIN_KEY: "legacy-secret",
      },
    })).toEqual({
      token: "legacy-secret",
      source: "legacy",
      envVar: "CONVEX_ADMIN_KEY",
    });
  });

  it("fails clearly when an admin intent token is missing", () => {
    expect(() => requireAdminIntentToken("citationEvidenceWrite", { env: {} })).toThrow(
      /CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE, CONVEX_ADMIN_KEY/,
    );
  });
});
