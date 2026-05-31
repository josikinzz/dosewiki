import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(filePath: string) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

function collectSourceFiles(entryPath: string): string[] {
  const absolutePath = path.join(repoRoot, entryPath);

  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    return /\.(?:ts|tsx|js|jsx)$/.test(entryPath) ? [entryPath] : [];
  }

  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(entryPath, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(childPath);
    }

    if (entry.isFile() && /\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      return [childPath];
    }

    return [];
  });
}

describe("shared UI ownership boundaries", () => {
  it("keeps dev-owned editor widgets out of the common barrel", () => {
    const commonBarrel = readRepoFile("src/components/common/index.ts");

    expect(commonBarrel).not.toMatch(/\b(?:DiffPreview|JsonEditor|TagMultiSelect|UiJsonToggle)\b/);
  });

  it("keeps dev-owned editor widgets under the dev feature boundary", () => {
    const devImportsFromCommon = collectSourceFiles("src/features/dev").flatMap((filePath) => {
      const source = readRepoFile(filePath);
      const matches = source.matchAll(
        /@\/components\/common\/(?:DiffPreview|JsonEditor|TagMultiSelect)\b/g,
      );

      return Array.from(matches, (match) => `${filePath}:${match[0]}`);
    });

    expect(devImportsFromCommon).toEqual([]);
  });

  it("keeps Button variants primitive instead of feature named", () => {
    const buttonSource = readRepoFile("src/components/ui/button.tsx");
    const forbiddenVariantNames = [
      "addCard",
      "brand",
      "categoryHeader",
      "dismissDanger",
      "generateCancel",
      "generatePrimary",
      "inlineLink",
      "pickerListItem",
      "searchOption",
      "sortIcon",
      "substanceLink",
      "substanceListItem",
      "tagListItem",
    ];

    expect(
      forbiddenVariantNames.filter((variantName) =>
        new RegExp(`\\b${variantName}\\s*:`).test(buttonSource),
      ),
    ).toEqual([]);
  });
});
