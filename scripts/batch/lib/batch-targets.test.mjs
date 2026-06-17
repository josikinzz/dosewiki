import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BATCH_ARTICLE_WRITE_SCRIPTS,
  createBatchTargetRunContext,
} from "./batch-targets.mjs";

const repoRoot = resolve(import.meta.dirname, "../../..");

describe("batch Convex target policy", () => {
  it("uses shared source and target precedence with CLI overrides first", () => {
    const context = createBatchTargetRunContext({
      operation: "batch test",
      argv: [
        "--source-url=https://cli-source.convex.cloud",
        "--target-url=https://cli-target.convex.cloud",
        "--dry-run",
      ],
      loadsEnvLocal: false,
      env: {
        SOURCE_CONVEX_URL: "https://env-source.convex.cloud",
        TARGET_CONVEX_URL: "https://env-target.convex.cloud",
        CONVEX_PUBLIC_READ_URL: "https://public-read.convex.cloud",
        CONVEX_URL: "https://default.convex.cloud",
      },
    });

    expect(context.sourceUrl).toBe("https://cli-source.convex.cloud");
    expect(context.sourceUrlKey).toBe("--source-url");
    expect(context.targetUrl).toBe("https://cli-target.convex.cloud");
    expect(context.targetUrlKey).toBe("--target-url");
  });

  it("prefers explicit target env over source/read fallbacks for writes", () => {
    const context = createBatchTargetRunContext({
      operation: "batch test",
      argv: [],
      loadsEnvLocal: false,
      env: {
        SOURCE_CONVEX_URL: "https://source.convex.cloud",
        TARGET_CONVEX_URL: "https://target.convex.cloud",
        CONVEX_URL: "https://default.convex.cloud",
      },
    });

    expect(context.sourceUrl).toBe("https://source.convex.cloud");
    expect(context.targetUrl).toBe("https://target.convex.cloud");
    expect(context.targetUrlKey).toBe("TARGET_CONVEX_URL");
  });

  it("requires stable article batch generators to use the shared target resolver", () => {
    expect(BATCH_ARTICLE_WRITE_SCRIPTS).toEqual([
      "scripts/batch/batch-generate-summary.mjs",
      "scripts/batch/batch-generate-tolerance.mjs",
      "scripts/batch/batch-generate-legality.mjs",
      "scripts/batch/batch-generate-harm-potential.mjs",
      "scripts/batch/batch-generate-history-culture.mjs",
      "scripts/batch/batch-generate-dosage-duration.mjs",
      "scripts/batch/batch-generate-pharmacology.mjs",
    ]);

    for (const scriptPath of BATCH_ARTICLE_WRITE_SCRIPTS) {
      const content = readFileSync(resolve(repoRoot, scriptPath), "utf8");
      expect(content, `${scriptPath} must use shared target policy`).toContain(
        "createBatchTargetRunContext",
      );
      expect(content, `${scriptPath} must not use raw Convex env fallback`).not.toMatch(
        /process\.env\.CONVEX_URL\s*\|\|\s*process\.env\.VITE_CONVEX_URL/,
      );
    }
  });
});
