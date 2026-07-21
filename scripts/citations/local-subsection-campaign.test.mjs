import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  assertLocalOnlyCampaignArguments,
  buildStageAwareResumePrompt,
  chooseCampaignRunId,
  inspectRunStage,
} from "./local-subsection-campaign.mjs";

const terminalSections = {
  summary: { status: "checked" },
  pharmacology: { status: "not_selected" },
  tolerance: { status: "not_selected" },
  harm_potential: { status: "not_selected" },
  history_culture: { status: "not_selected" },
  legality: { status: "not_selected" },
};

function manifest(overrides = {}) {
  return {
    outcome: "prepared",
    sections: terminalSections,
    gates: {
      remap: { result: "passed" },
      section_rechecks: { result: "passed" },
      proactive_scan: { result: "passed" },
      article_wide_packet: { result: "passed" },
      article_wide_sanitize: { result: "passed" },
      article_wide_residue_scan: { result: "passed" },
    },
    ...overrides,
  };
}

describe("local subsection campaign hardening", () => {
  it("treats a process-independent finalized manifest as the only success state", () => {
    expect(inspectRunStage({ manifest: null })).toEqual({ stage: "initialize", reason: "manifest_missing" });
    expect(inspectRunStage({ manifest: manifest(), runFiles: { articleWide: false } }).stage).toBe("article_wide");
    expect(inspectRunStage({
      manifest: manifest({ outcome: "needs_review", finalizedAt: "2026-01-01T00:00:00Z" }),
      runFiles: { articleWide: true },
    }).stage).toBe("finalized");
  });

  it("resumes only the first incomplete stage and preserves accepted research", () => {
    const prompt = buildStageAwareResumePrompt({
      slug: "example",
      runId: "example-repair",
      stage: { stage: "article_wide", reason: "article_wide_missing" },
    });
    expect(prompt).toContain("Create only article-wide.json");
    expect(prompt).toContain("preserve every accepted artifact");
    expect(prompt).toContain("Never apply a draft");
  });

  it("keeps immutable research lanes explicit during second-pass recovery", () => {
    const prompt = buildStageAwareResumePrompt({
      slug: "datura",
      runId: "datura-second-pass-1",
      stage: { stage: "sections", reason: "section_status_pending" },
      researchPass: "second",
    });
    expect(prompt).toContain("immutable researchBrief lanes");
    expect(prompt).toContain("confirmed_needs_source");
    expect(prompt).toContain("Run only sections without terminal manifest statuses");
  });

  it("rejects every production or apply argument", () => {
    expect(() => assertLocalOnlyCampaignArguments(["--slug=example", "--write"]))
      .toThrow(/rejects production\/apply arguments/);
    expect(() => assertLocalOnlyCampaignArguments(["--confirm-citation-write"]))
      .toThrow(/rejects production\/apply arguments/);
    expect(() => assertLocalOnlyCampaignArguments(["--slug=example", "--source-url=https://example.convex.cloud"]))
      .not.toThrow();
  });

  it("protects finalized slug runs with a distinct successor while preserving researching identity", () => {
    const workbench = mkdtempSync(resolve(tmpdir(), "citation-campaign-run-id-"));
    const base = resolve(workbench, "runs/example");
    mkdirSync(base, { recursive: true });
    writeFileSync(resolve(base, "pi-run-manifest.json"), JSON.stringify({ outcome: "needs_review", finalizedAt: "2026-01-01T00:00:00Z" }));
    expect(chooseCampaignRunId({ workbench, slug: "example", rows: [{ status: "ready" }] })).toBe("example-local-1");
    expect(chooseCampaignRunId({ workbench, slug: "example", rows: [{ status: "researching", runId: "example-repair" }] })).toBe("example-repair");
    expect(chooseCampaignRunId({
      workbench,
      slug: "example",
      rows: [{ status: "ready" }],
      preferredRunId: "example-second-pass-1",
    })).toBe("example-second-pass-1");
  });

  it("reports reconciliation and downstream recovery without restarting sections", () => {
    const reconciliation = manifest({ gates: { remap: { result: "passed" }, section_rechecks: { result: "failed" } } });
    expect(inspectRunStage({ manifest: reconciliation, runFiles: {} })).toEqual({ stage: "reconciliation", reason: "section_rechecks" });

    const downstream = manifest({
      gates: {
        ...manifest().gates,
        article_wide_check: { result: "passed" },
        assemble_draft: { result: "passed" },
        validate: { result: "failed" },
      },
    });
    expect(inspectRunStage({ manifest: downstream, runFiles: { articleWide: true } }))
      .toEqual({ stage: "downstream", reason: "validate" });
  });
});
