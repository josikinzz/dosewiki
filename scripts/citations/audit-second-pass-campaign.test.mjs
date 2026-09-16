import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { auditSecondPassCampaign } from "./audit-second-pass-campaign.mjs";
import {
  reconcileSecondPassDerivedState,
  sha256,
} from "./second-pass-derived-state.mjs";
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
    source: { auditSha256: "abc", postgresIdentity: "example/dosewiki" },
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
  const draft = {
    selectedSections,
    article: { slug: "example" },
    markedSections: { summary: "Text[cite:ref-1]" },
    evidence: [{ fieldPath: "summary", status: "supported" }],
    gaps: [],
    researchLog: ["Inspected references"],
  };
  writeFileSync(resolve(runPath, "citation-draft.json"), JSON.stringify(draft));
  const draftSha256 = sha256(JSON.stringify(draft));
  const gates = Object.fromEntries(finalGates.map((gate) => [gate, { result: "passed" }]));
  gates.final_review_surface_scan.snapshot = { draft: draftSha256 };
  writeFileSync(resolve(runPath, "pi-run-manifest.json"), JSON.stringify({
    outcome: "needs_review",
    finalizedAt: "2026-07-19T01:00:00.000Z",
    gates,
  }));
  writeFileSync(resolve(runPath, "citation-report.md"), "# Report\n");
  const reconciled = reconcileSecondPassDerivedState({
    plan,
    tracker,
    campaignState: {
      productionWrites: false,
      runs: [
        { runId: "example-second-pass-1", outcome: "planned" },
        { runId: "example-second-pass-1", outcome: "blocked_local" },
      ],
    },
    workbench,
    immutablePlanSha256: sha256(JSON.stringify(plan)),
  });
  return { plan, tracker: reconciled.tracker, workbench, campaignState: reconciled.campaignState };
}

describe("second-pass campaign final audit", () => {
  it("resolves current rows without deduplicating append-only campaign history", () => {
    const data = fixture();
    const report = auditSecondPassCampaign(data);
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
    const report = auditSecondPassCampaign({ ...data, campaignState: { ...data.campaignState, productionWrites: true } });
    expect(report.ok).toBe(false);
    expect(report.errors.join(" ")).toMatch(/productionWrites=false/);
    expect(report.errors.join(" ")).toMatch(/incomplete/);
  });

  it("repairs a stale zero tracker marker count from the accepted draft", () => {
    const data = fixture();
    const row = data.tracker.items.find((entry) => entry.slug === "example");
    row.markerCount = 0;
    expect(auditSecondPassCampaign(data).errors.join(" ")).toMatch(/tracker row example:summary does not match current campaign row/);

    const repaired = reconcileSecondPassDerivedState({
      ...data,
      campaignState: data.campaignState,
      immutablePlanSha256: sha256(JSON.stringify(data.plan)),
    });
    expect(repaired.trackerChanges).toBe(1);
    expect(repaired.tracker.items.find((entry) => entry.slug === "example").markerCount).toBe(1);
  });
});
