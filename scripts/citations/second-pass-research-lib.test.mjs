import { describe, expect, it } from "vitest";
import {
  buildSecondPassCampaignTracker,
  buildSecondPassResearchPlan,
  secondPassScopeForSlug,
} from "./second-pass-research-lib.mjs";

function section({ chars = 300, markerCount = 0, viable = true, coverageForm = "legacy_bibliography" } = {}) {
  return {
    chars,
    markerCount,
    viable,
    coverageForm,
    contentHash: `${chars}-${markerCount}-${viable}`,
  };
}

function auditFixture() {
  return {
    schemaVersion: "dosewiki_subsection_citation_audit_v1",
    generatedAt: "2026-07-19T00:00:00.000Z",
    source: { postgresIdentity: "example/dosewiki" },
    articles: [
      {
        slug: "datura",
        title: "Datura",
        queueStatus: "complete",
        referenceCount: 17,
        sections: {
          summary: section({ chars: 530 }),
          pharmacology: section({ chars: 454, markerCount: 30, coverageForm: "inline" }),
          tolerance: section({ chars: 200 }),
          harm_potential: section({ chars: 1000, markerCount: 4, coverageForm: "inline" }),
          history_culture: section({ chars: 1000, markerCount: 4, coverageForm: "inline" }),
          legality: section({ chars: 500, markerCount: 2, coverageForm: "inline" }),
        },
      },
      {
        slug: "obscure-rc",
        title: "Obscure RC",
        referenceCount: 0,
        sections: {
          summary: section(),
          pharmacology: section(),
          tolerance: section(),
          harm_potential: section(),
          history_culture: section({ viable: false }),
          legality: section({ viable: false }),
        },
      },
      {
        slug: "deschloroketamine",
        title: "Deschloroketamine",
        referenceCount: 20,
        sections: { summary: section() },
      },
    ],
  };
}

describe("second-pass research planning", () => {
  it("targets Datura summary while recognizing that pharmacology is already cited", () => {
    const plan = buildSecondPassResearchPlan(auditFixture(), { generatedAt: "2026-07-19T01:00:00.000Z" });
    const datura = plan.substances.find((entry) => entry.slug === "datura");
    expect(datura.sections).toHaveLength(1);
    expect(datura.sections[0]).toMatchObject({
      section: "summary",
      priority: "wave_1_obvious",
      feasibility: "high",
      status: "proposed",
    });
    expect(datura.sections[0].researchLanes.length).toBeGreaterThan(1);
  });

  it("excludes tolerance and deschloroketamine and defers source-empty research chemicals", () => {
    const plan = buildSecondPassResearchPlan(auditFixture());
    expect(plan.substances.some((entry) => entry.slug === "deschloroketamine")).toBe(false);
    const obscure = plan.substances.find((entry) => entry.slug === "obscure-rc");
    expect(obscure.sections.map((entry) => entry.section)).toEqual(["harm_potential", "pharmacology", "summary"]);
    expect(obscure.sections.every((entry) => entry.priority === "defer_sparse")).toBe(true);
    expect(plan.summary.deferredSparseCandidates).toBe(3);
  });

  it("freezes an actionable per-slug research brief for task export", () => {
    const plan = buildSecondPassResearchPlan(auditFixture(), { generatedAt: "2026-07-19T01:00:00.000Z" });
    const scope = secondPassScopeForSlug(plan, "datura", { maxWave: 1 });
    expect(scope.selectedSections).toEqual(["summary"]);
    expect(scope.researchBrief).toMatchObject({
      pass: "second",
      recommendedRunId: "datura-second-pass-1",
    });
    expect(scope.researchBrief.candidates[0].completionCriteria).toHaveLength(3);
    expect(() => secondPassScopeForSlug(plan, "obscure-rc", { maxWave: 3 })).toThrow(/no actionable rows/);
  });

  it("seeds an independent second-pass tracker with actionable and deferred rows", () => {
    const generatedAt = "2026-07-19T02:00:00.000Z";
    const plan = buildSecondPassResearchPlan(auditFixture(), { generatedAt });
    const tracker = buildSecondPassCampaignTracker(plan, { generatedAt });
    expect(tracker).toMatchObject({
      schemaVersion: "dosewiki_subsection_rollout_v1",
      campaignKind: "citation_second_pass",
      researchPass: "second",
    });
    expect(tracker.items.filter((row) => row.status === "ready")).toHaveLength(1);
    expect(tracker.items.filter((row) => row.status === "excluded")).toHaveLength(3);
    expect(tracker.items.find((row) => row.slug === "datura")).toMatchObject({
      section: "summary",
      status: "ready",
      recommendedRunId: "datura-second-pass-1",
    });
  });
});
