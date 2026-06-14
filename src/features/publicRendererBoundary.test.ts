import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function firstMeaningfulLine(source: string) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("/**") && !line.startsWith("*") && line !== "*/");
}

describe("public renderer server-first boundaries", () => {
  const serverShells = [
    "src/features/article/pages/SubstanceArticlePage.tsx",
    "src/features/article/components/ArticleLayout.tsx",
    "src/features/effects/pages/EffectsIndexPage.tsx",
    "src/components/pages/CategoryPage.tsx",
    "src/features/effects/pages/EffectArticlePage.tsx",
    "src/features/effects/pages/EffectCategoryPage.tsx",
    "src/features/reports/pages/TripReportsPage.tsx",
    "src/components/pages/UserProfilePage.tsx",
    "src/components/pages/AboutPage.tsx",
    "src/components/pages/ClassificationDetailPage.tsx",
    "src/components/pages/MechanismDetailPage.tsx",
  ];

  it("keeps migrated public render shells out of page-wide client boundaries", () => {
    expect(
      serverShells.filter((filePath) => firstMeaningfulLine(readSource(filePath)) === '"use client";'),
    ).toEqual([]);
  });

  it("keeps migrated public render shells on href models instead of legacy route callbacks", () => {
    const legacyCallbackProps = /\b(?:onNavigate|onNavigateBack|onSelectDrug|onSelectCategory|onSelectEffect|onSelectMechanism|onSelectClassification|onSelectInteraction|onSelectReport)\b/;

    expect(
      serverShells
        .map((filePath) => ({ filePath, source: readSource(filePath) }))
        .filter(({ source }) => legacyCallbackProps.test(source))
        .map(({ filePath }) => filePath),
    ).toEqual([]);
  });
});
