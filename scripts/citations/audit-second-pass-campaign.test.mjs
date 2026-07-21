import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { auditSecondPassCampaign } from "./audit-second-pass-campaign.mjs";
import { buildSecondPassCampaignTracker } from "./second-pass-research-lib.mjs";

const finalGates = [
  "preflight", "remap", "section_rechecks", "proactive_scan", "article_wide_packet",
  "article_wide_sanitize", "article_wide_residue_scan", "article_wide_check",
  "assemble_draft", "validate", "validate_patches", "final_review_surface_scan",
];

function fixture() {
  const plan = {
    schemaVersion: "dosewiki_citation_second_pass_plan_v1",
    generatedAt: "2026-07-19T00:00:00.000Z",
    source: { auditSha256: "abc", convexUrl: "https://example.convex.cloud" },
    substances: [{
      slug: "example",
      title: "Example",
      recommendedRunId: "example-second-pass-1",
      sections: [{
        section: "summary",
        status: "proposed",
        priority: "wave_1_obvious",
        score: 10,
        chars: 100,
        contentHash: "hash",
        coverageForm: "uncited",
        researchLanes: ["Inspect references"],
      }],
    }, {
      slug: "sparse",
      title: "Sparse",
      recommendedRunId: "sparse-second-pass-1",
      sections: [{
        section: "pharmacology",
        status: "deferred_sparse",
        priority: "defer_sparse",
        score: 2,
        chars: 100,
        contentHash: "sparse-hash",
        coverageForm: "uncited",
        researchLanes: ["Inspect references"],
      }],
    }],
  };
  const tracker = buildSecondPassCampaignTracker(plan, { generatedAt: "2026-07-19T00:00:00.000Z" });
  const row = tracker.items.find((entry) => entry.slug === "example");
  Object.assign(row, { status: "needs_review", runId: "example-second-pass-1" });
  const workbench = mkdtempSync(resolve(tmpdir(), "second-pass-audit-"));
  const runPath = resolve(workbench, "runs/example-second-pass-1");
  mkdirSync(runPath, { recursive: true });
  const selectedSections = ["summary"];
  writeFileSync(resolve(runPath, "citation-task.json"), JSON.stringify({
    researchPass: "second",
    selectedSections,
    researchBrief: { pass: "second", candidates: [{ section: "summary", researchLanes: ["Inspect references"] }] },
    article: { slug: "example", citableSections: { summary: "Text" } },
  }));
  writeFileSync(resolve(runPath, "pi-run-manifest.json"), JSON.stringify({
    outcome: "needs_review",
    finalizedAt: "2026-07-19T01:00:00.000Z",
    gates: Object.fromEntries(finalGates.map((gate) => [gate, { result: "passed" }])),
  }));
  writeFileSync(resolve(runPath, "citation-draft.json"), JSON.stringify({
    selectedSections,
    article: { slug: "example" },
    markedSections: { summary: "Text[cite:ref-1]" },
    evidence: [{ fieldPath: "summary", status: "supported" }],
    gaps: [],
    researchLog: ["Inspected references"],
  }));
  writeFileSync(resolve(runPath, "citation-report.md"), "# Report\n");
  return { plan, tracker, workbench };
}

describe("second-pass campaign final audit", () => {
  it("accepts only finalized plan-bound local runs and explicit deferrals", () => {
    const data = fixture();
    const report = auditSecondPassCampaign({ ...data, campaignState: { productionWrites: false } });
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      planRows: 2,
      actionableRows: 1,
      deferredRows: 1,
      finalizedRuns: 1,
      needsReview: 1,
      ready: 0,
      researching: 0,
      productionWrites: false,
    });
  });

  it("fails closed on incomplete tracker state and production-write ambiguity", () => {
    const data = fixture();
    data.tracker.items.find((entry) => entry.slug === "example").status = "researching";
    const report = auditSecondPassCampaign({ ...data, campaignState: { productionWrites: true } });
    expect(report.ok).toBe(false);
    expect(report.errors.join(" ")).toMatch(/productionWrites=false/);
    expect(report.errors.join(" ")).toMatch(/incomplete/);
  });
});
