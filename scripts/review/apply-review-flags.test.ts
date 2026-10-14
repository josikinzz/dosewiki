import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { parseReviewApplyOptions, runReviewApply } from "./apply-review-flags";

const runId = "article-review-2026-08-02";

function makeRun(findings: Record<string, unknown>, slugs = Object.keys(findings)): string {
  const repoRoot = mkdtempSync(resolve(tmpdir(), "review-flags-test-"));
  const runDirectory = resolve(repoRoot, "runs", runId);
  mkdirSync(resolve(runDirectory, "findings"), { recursive: true });
  writeFileSync(resolve(runDirectory, "manifest.json"), JSON.stringify({ runId, slugs }));
  for (const [slug, value] of Object.entries(findings)) {
    writeFileSync(resolve(runDirectory, "findings", `${slug}.json`), JSON.stringify(value));
  }
  return repoRoot;
}

function validFindings(slug: string, flags: unknown[] = [{
  label: "summary drift",
  severity: "major",
  note: "Rewrite the summary.",
  section: "summary",
}]): Record<string, unknown> {
  return { slug, run_id: runId, flags };
}

describe("Review Flag apply command", () => {
  it("refuses writes unless every confirmation flag is present", async () => {
    const repoRoot = makeRun({ fixture: validFindings("fixture") });
    const cwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const base = [`--run-id=${runId}`, "--write"];
      const env = { NODE_ENV: "test", DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "postgresql://localhost/test-deployment", DATA_ADMIN_KEY: "test-token" } as const;
      await expect(runReviewApply(parseReviewApplyOptions(base), { env, logger: { log: vi.fn() } })).rejects.toThrow(/--confirm-review-flags/);
      await expect(runReviewApply(parseReviewApplyOptions([...base, "--confirm-review-flags"]), { env, logger: { log: vi.fn() } })).rejects.toThrow(/--confirm-write=apply-review-flags/);
      await expect(runReviewApply(parseReviewApplyOptions([...base, "--confirm-review-flags", "--confirm-write=apply-review-flags"]), { env, logger: { log: vi.fn() } })).rejects.toThrow(/--expected-deployment=localhost\/test-deployment/);
    } finally {
      process.chdir(cwd);
    }
  });

  it("blocks every mutation when any findings file is invalid", async () => {
    const repoRoot = makeRun({
      good: validFindings("good"),
      bad: validFindings("bad", [{ label: "too many label words", severity: "major", note: "x" }]),
    });
    const mutation = vi.fn();
    const cwd = process.cwd();
    process.chdir(repoRoot);
    try {
      await expect(runReviewApply(parseReviewApplyOptions([
        `--run-id=${runId}`,
        "--write",
        "--confirm-review-flags",
        "--confirm-write=apply-review-flags",
        "--expected-deployment=localhost/test-deployment",
      ]), {
        env: { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "postgresql://localhost/test-deployment", DATA_ADMIN_KEY: "test-token" } as unknown as NodeJS.ProcessEnv,
        logger: { log: vi.fn() },
        createClient: () => ({ mutation } as never),
      })).rejects.toThrow(/findings validation failed/);
    } finally {
      process.chdir(cwd);
    }
    expect(mutation).not.toHaveBeenCalled();
  });
});
