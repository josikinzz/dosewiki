import path from "node:path";

import { describe, expect, it } from "vitest";

import { buttonVariants } from "./button";
import * as commonBarrel from "@/components/common";
import { readSourceFiles } from "@/test/sourceScan";


type ImportRecord = {
  filePath: string;
  importPath: string;
  isTypeOnly: boolean;
  resolvedPath: string;
};

function resolveRepoImport(filePath: string, importPath: string) {
  if (importPath.startsWith("@/")) {
    return path.posix.normalize(`src/${importPath.slice(2)}`);
  }

  if (importPath.startsWith("@lib/")) {
    return path.posix.normalize(`lib/${importPath.slice(5)}`);
  }

  if (importPath.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(filePath), importPath));
  }

  return importPath;
}

function collectImports(entryPath: string): ImportRecord[] {
  return readSourceFiles([entryPath], { extensions: /\.(?:ts|tsx|js|jsx)$/ }).flatMap(
    ({ path: filePath, text: source }) => {
      const matches = source.matchAll(
        /import\s+(type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["'];/g,
      );

      return Array.from(matches, (match) => ({
        filePath,
        importPath: match[2],
        isTypeOnly: Boolean(match[1]),
        resolvedPath: resolveRepoImport(filePath, match[2]),
      }));
    },
  );
}

describe("shared UI ownership boundaries", () => {
  it("keeps dev-owned editor widgets out of the common barrel", () => {
    expect(Object.keys(commonBarrel)).not.toEqual(
      expect.arrayContaining(["DiffPreview", "JsonEditor", "TagMultiSelect", "UiJsonToggle"]),
    );
  });

  it("policy: dev editor widgets are never imported from @/components/common", () => {
    const devImportsFromCommon = readSourceFiles(["src/features/dev"]).flatMap(
      ({ path: filePath, text: source }) => {
        const matches = source.matchAll(
          /@\/components\/common\/(?:DiffPreview|JsonEditor|TagMultiSelect)\b/g,
        );

        return Array.from(matches, (match) => `${filePath}:${match[0]}`);
      },
    );

    expect(devImportsFromCommon).toEqual([]);
  });

  it("policy: src/components/common imports nothing from app, features, data, schema, citations, or lib/data", () => {
    const allowedCommonBoundaryImports = [
      {
        filePath: "src/components/common/GlobalSearch.tsx",
        importPath: "../../data/builders/search",
        isTypeOnly: true,
      },
      {
        filePath: "src/components/common/useGlobalSearchSuggestions.ts",
        importPath: "../../data/builders/search",
        isTypeOnly: true,
      },
    ];
    const forbiddenPathPrefixes = [
      "src/app/",
      "src/features/",
      "src/data/",
      "src/schema/",
      "src/lib/citations/",
      "lib/data/",
    ];
    const forbiddenImports = collectImports("src/components/common").filter((record) => {
      const isForbiddenPath = forbiddenPathPrefixes.some((prefix) =>
        record.resolvedPath.startsWith(prefix),
      );
      const isAllowed = allowedCommonBoundaryImports.some(
        (allowed) =>
          allowed.filePath === record.filePath &&
          allowed.importPath === record.importPath &&
          allowed.isTypeOnly === record.isTypeOnly,
      );

      return isForbiddenPath && !isAllowed;
    });

    expect(
      forbiddenImports.map(
        (record) =>
          `${record.filePath} imports ${record.importPath} (${record.resolvedPath})`,
      ),
    ).toEqual([]);
  });

  it("keeps Button variants primitive instead of feature named", () => {
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
    const unknownVariantClasses = buttonVariants({ variant: "not-a-variant" as never });
    const definedForbiddenVariants = forbiddenVariantNames.filter(
      (variantName) => buttonVariants({ variant: variantName as never }) !== unknownVariantClasses,
    );

    expect(definedForbiddenVariants).toEqual([]);
  });

});
