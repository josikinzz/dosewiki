import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { sha256 } from "./second-pass-derived-state.mjs";
import {
  buildCitationReviewData,
  renderCitationReviewDossier,
  validateCitationReviewData,
} from "./build-citation-review-dossier.mjs";

function fixture() {
  const workbench = mkdtempSync(resolve(tmpdir(), "citation-dossier-"));
  const run = resolve(workbench, "runs/example-repair");
  mkdirSync(run, { recursive: true });
  writeFileSync(resolve(run, "pi-run-manifest.json"), JSON.stringify({
    runId: "example-repair",
    outcome: "needs_review",
    finalizedAt: "2026-01-01T00:00:00Z",
    selectedSections: ["summary"],
  }));
  writeFileSync(resolve(run, "citation-task.json"), JSON.stringify({
    article: { slug: "example", title: "Example", citableSections: { summary: "Original." } },
  }));
  writeFileSync(resolve(run, "citation-draft.json"), JSON.stringify({
    schemaVersion: "dosewiki_citation_draft_v1",
    citationMode: "marker_only",
    taskId: "example-repair",
    generatedAt: "2026-01-01T00:00:00Z",
    article: { slug: "example", title: "Example" },
    selectedSections: ["summary"],
    markedSections: { summary: "Supported.[cite:paper]" },
    references: [{ id: "paper", title: "Paper" }],
    sources: [{ id: "source", referenceId: "paper", content: "Supported." }],
    evidence: [{
      claimKey: "summary-supported",
      claimText: "Supported.",
      fieldPath: "summary",
      status: "supported",
      referenceIds: ["paper"],
      supports: [{ sourceId: "source", referenceId: "paper", supportingQuote: "Supported.", rationale: "Direct." }],
    }],
    gaps: [],
    researchLog: [],
    notes: [],
    articlePatches: [],
  }));
  writeFileSync(resolve(run, "citation-report.md"), "# Review\n");
  return workbench;
}

describe("citation review dossier", () => {
  it("builds every actionable row from its tracker-bound finalized run", () => {
    const workbench = fixture();
    const tracker = {
      updatedAt: "2026-01-02T00:00:00Z",
      items: [
        { slug: "example", section: "summary", status: "needs_review", runId: "example-repair" },
        { slug: "other", section: "tolerance", status: "excluded", reason: "Product decision" },
      ],
    };
    const data = buildCitationReviewData({ tracker, workbench, campaignState: { completedAt: "2026-01-03T00:00:00Z" } });
    expect(data.meta).toMatchObject({ actionableRows: 1, needsReview: 1, needsSource: 0, excluded: 1, localRuns: 1 });
    expect(data.rows[0]).toMatchObject({
      markerCount: 1,
      sectionData: "Supported.[cite:paper]",
      usedReferenceIds: ["paper"],
    });
    expect(data.rows[0].evidence).toHaveLength(1);
    expect(data.rows[0].sources).toHaveLength(1);
    expect(validateCitationReviewData(data)).toBe(true);
  });

  it("renders one self-contained payload and escapes script-breaking markup", () => {
    const html = renderCitationReviewDossier({
      template: '<script id="review-data" type="application/json">__DOSEWIKI_REVIEW_DATA__</script>',
      data: { rows: [{ text: "</script><p>safe</p>" }] },
    });
    expect(html).not.toContain("</script><p>");
    expect(html).toContain("\\u003c/script>");
    expect(html).not.toContain("__DOSEWIKI_REVIEW_DATA__");
  });

  it("fails closed when a rendered marker loses its reference/evidence trail", () => {
    expect(() => validateCitationReviewData({
      meta: { actionableRows: 1, needsReview: 1, needsSource: 0 },
      rows: [{
        tracker: { slug: "example", section: "summary", status: "needs_review" },
        sectionData: "Claim.[cite:missing]",
        evidence: [],
        allRunReferences: [],
        sources: [],
      }],
    })).toThrow(/marker references missing missing/);
  });

  it("fails closed when the displayed accepted section disagrees with its current row", () => {
    const workbench = fixture();
    const run = resolve(workbench, "runs/example-repair");
    const draftSha256 = sha256(readFileSync(resolve(run, "citation-draft.json")));
    const manifest = JSON.parse(readFileSync(resolve(run, "pi-run-manifest.json"), "utf8"));
    manifest.gates = { final_review_surface_scan: { snapshot: { draft: draftSha256 } } };
    writeFileSync(resolve(run, "pi-run-manifest.json"), JSON.stringify(manifest));
    const tracker = {
      researchPass: "second",
      items: [{ slug: "example", section: "summary", status: "needs_review", markerCount: 1, runId: "example-repair" }],
    };
    const data = buildCitationReviewData({
      tracker,
      workbench,
      campaignState: {
        currentRows: [{
          key: "example:summary",
          slug: "example",
          section: "summary",
          status: "needs_source",
          markerCount: 0,
          runId: "example-repair",
          finalizedAt: "2026-01-01T00:00:00Z",
          finalizedDraftSha256: draftSha256,
          finalReviewDraftSha256: draftSha256,
        }],
      },
    });
    expect(() => validateCitationReviewData(data)).toThrow(/current-row\/count mismatch/);
  });

  it("fails closed when an actionable tracker row has no finalized run", () => {
    const workbench = mkdtempSync(resolve(tmpdir(), "citation-dossier-missing-"));
    expect(() => buildCitationReviewData({
      tracker: { items: [{ slug: "missing", section: "summary", status: "needs_source", runId: "missing" }] },
      workbench,
    })).toThrow(/incomplete run/);
  });
});
