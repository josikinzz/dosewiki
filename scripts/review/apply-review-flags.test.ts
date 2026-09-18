import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  loadReviewApplyPlan,
  parseReviewApplyOptions,
  runReviewApply,
} from "./apply-review-flags";

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

describe("Review Flag findings validation", () => {
  it.each([
    ["bad label", { label: "one two three four", severity: "major", note: "x" }, /1–3 words/],
    ["bad severity", { label: "summary", severity: "critical", note: "x" }, /major, minor, or note/],
    ["bad section", { label: "summary", severity: "minor", note: "x", section: "not-a-section" }, /canonical section id/],
  ])("rejects %s", (_name, flag, expected) => {
    const repoRoot = makeRun({ fixture: validFindings("fixture", [flag]) });
    expect(() => loadReviewApplyPlan(repoRoot, runId)).toThrow(expected);
  });

  it("rejects a slug that does not match its filename", () => {
    const repoRoot = makeRun({ fixture: validFindings("different") }, ["different"]);
    expect(() => loadReviewApplyPlan(repoRoot, runId)).toThrow(/slug must match filename fixture/);
  });

  it("accepts an empty flags array as a clear operation", () => {
    const repoRoot = makeRun({ fixture: validFindings("fixture", []) });
    expect(loadReviewApplyPlan(repoRoot, runId)).toEqual([validFindings("fixture", [])]);
  });

  it("validates the whole run before exposing any apply plan", () => {
    const repoRoot = makeRun({
      good: validFindings("good"),
      bad: validFindings("bad", [{ label: "bad", severity: "blocker", note: "x" }]),
    });
    expect(() => loadReviewApplyPlan(repoRoot, runId)).toThrow(/bad\.json.*severity/s);
  });
});

describe("Review Flag apply command", () => {
  it("prints a complete dry-run plan without creating a client", async () => {
    const repoRoot = makeRun({ alpha: validFindings("alpha", []), beta: validFindings("beta") });
    const log = vi.fn();
    const createClient = vi.fn();
    const cwd = process.cwd();
    process.chdir(repoRoot);
    try {
      await runReviewApply(parseReviewApplyOptions([`--run-id=${runId}`]), {
        env: { NODE_ENV: "test", DATA_BACKEND: "postgres" }, logger: { log }, createClient,
      });
    } finally {
      process.chdir(cwd);
    }
    const output = log.mock.calls.map(([line]) => line).join("\n");
    expect(output).toContain("alpha: replace agent flags with 0 flag(s) (clear agent flags)");
    expect(output).toContain("beta: replace agent flags with 1 flag(s)");
    expect(output).toContain("[major] summary drift @ summary: Rewrite the summary.");
    expect(createClient).not.toHaveBeenCalled();
  });

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

  it("makes one mutation call per article after full confirmation", async () => {
    const repoRoot = makeRun({ alpha: validFindings("alpha", []), beta: validFindings("beta") });
    const mutation = vi.fn().mockResolvedValue({ ok: true });
    const updateAudit = vi.fn();
    const cwd = process.cwd();
    process.chdir(repoRoot);
    try {
      await runReviewApply(parseReviewApplyOptions([
        `--run-id=${runId}`,
        "--write",
        "--confirm-review-flags",
        "--confirm-write=apply-review-flags",
        "--expected-deployment=localhost/test-deployment",
      ]), {
        env: { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "postgresql://localhost/test-deployment", DATA_ADMIN_KEY: "test-token" } as unknown as NodeJS.ProcessEnv,
        logger: { log: vi.fn() },
        createClient: () => ({ mutation } as never),
        writeAudit: () => ({ path: "/mock/audit.json", entry: {} }),
        updateAudit,
      });
    } finally {
      process.chdir(cwd);
    }
    expect(mutation).toHaveBeenCalledTimes(2);
    expect(mutation.mock.calls.map(([, args]) => args)).toEqual([
      { apiKey: "test-token", slug: "alpha", runId, flags: [] },
      { apiKey: "test-token", slug: "beta", runId, flags: validFindings("beta").flags },
    ]);
    expect(updateAudit).toHaveBeenCalledWith("/mock/audit.json", expect.objectContaining({ status: "completed", runId }));
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
