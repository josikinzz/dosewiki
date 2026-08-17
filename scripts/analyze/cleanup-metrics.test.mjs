import { describe, expect, it } from "vitest";

import {
  evaluateCleanupMetricBudgets,
  collectCleanupMetricCheckFailures,
} from "./cleanup-metrics.ts";

describe("cleanup metrics budgets", () => {
  it("fails active logic files over category budgets unless a reviewed exception covers them", () => {
    const files = [
      {
        file: "scripts/analyze/new-large-tool.mjs",
        loc: 501,
        generated: false,
        configHeavy: false,
        deprecated: false,
      },
      {
        file: "scripts/citations/formal-citations-core.mjs",
        loc: 1176,
        generated: false,
        configHeavy: false,
        deprecated: false,
      },
    ];

    const budgetReport = evaluateCleanupMetricBudgets(files, {
      budgets: {
        activeLogic: {
          maxLoc: 500,
          reason: "Active logic must stay decomposed.",
        },
      },
      exceptions: [
        {
          file: "scripts/citations/formal-citations-core.mjs",
          maxLoc: 1200,
          owner: "citations-maintainers",
          reason: "Existing oversized citations module retained until TN-031 decomposition.",
          reviewDate: "2026-05-28",
        },
      ],
    });

    expect(budgetReport).toEqual([
      expect.objectContaining({
        file: "scripts/analyze/new-large-tool.mjs",
        actualLoc: 501,
        budgetLoc: 500,
        status: "FAIL",
        reason: "Active logic must stay decomposed.",
      }),
      expect.objectContaining({
        file: "scripts/citations/formal-citations-core.mjs",
        actualLoc: 1176,
        budgetLoc: 1200,
        status: "PASS",
        owner: "citations-maintainers",
        reviewDate: "2026-05-28",
      }),
    ]);

    expect(collectCleanupMetricCheckFailures({ budgetReport })).toEqual([
      expect.objectContaining({
        file: "scripts/analyze/new-large-tool.mjs",
        status: "FAIL",
      }),
    ]);
  });

  it("reports tests, static registries, and cohesive documents separately without relaxing 500 LOC", () => {
    const files = [
      {
        file: "src/features/example/Example.test.tsx",
        loc: 501,
        generated: false,
        configHeavy: false,
        deprecated: false,
      },
      {
        file: "src/data/config/sourceFavicons.ts",
        loc: 550,
        generated: false,
        configHeavy: false,
        deprecated: false,
      },
      {
        file: "src/app/docs/how/page.tsx",
        loc: 550,
        generated: false,
        configHeavy: false,
        deprecated: false,
      },
    ];
    const budgets = {
      activeLogic: { maxLoc: 500, reason: "active" },
      test: { maxLoc: 500, reason: "test" },
      staticRegistry: { maxLoc: 500, reason: "registry" },
      cohesiveDocument: { maxLoc: 500, reason: "document" },
    };
    const exceptions = [
      {
        file: "src/data/config/sourceFavicons.ts",
        maxLoc: 600,
        owner: "data-config-maintainers",
        reason: "One source-owned registry.",
        reviewDate: "2026-08-16",
      },
      {
        file: "src/app/docs/how/page.tsx",
        maxLoc: 600,
        owner: "public-docs-maintainers",
        reason: "One scroll narrative.",
        reviewDate: "2026-08-16",
      },
    ];

    expect(evaluateCleanupMetricBudgets(files, { budgets, exceptions })).toEqual([
      expect.objectContaining({
        file: "src/features/example/Example.test.tsx",
        category: "test",
        budgetLoc: 500,
        status: "FAIL",
      }),
      expect.objectContaining({
        file: "src/data/config/sourceFavicons.ts",
        category: "staticRegistry",
        budgetLoc: 600,
        status: "PASS",
      }),
      expect.objectContaining({
        file: "src/app/docs/how/page.tsx",
        category: "cohesiveDocument",
        budgetLoc: 600,
        status: "PASS",
      }),
    ]);
  });

  it("treats oversized exceptions without owner, reason, and review date as check failures", () => {
    const budgetReport = evaluateCleanupMetricBudgets(
      [
        {
          file: "scripts/analyze/owned-but-undocumented.mjs",
          loc: 650,
          generated: false,
          configHeavy: false,
          deprecated: false,
        },
      ],
      {
        budgets: {
          activeLogic: {
            maxLoc: 500,
            reason: "Active logic must stay decomposed.",
          },
        },
        exceptions: [
          {
            file: "scripts/analyze/owned-but-undocumented.mjs",
            maxLoc: 700,
            owner: "",
            reason: "",
            reviewDate: "",
          },
        ],
      },
    );

    expect(budgetReport).toEqual([
      expect.objectContaining({
        file: "scripts/analyze/owned-but-undocumented.mjs",
        actualLoc: 650,
        budgetLoc: 700,
        status: "FAIL",
        reason: "Reviewed exception is missing owner, reason, or reviewDate.",
      }),
    ]);
  });
});
