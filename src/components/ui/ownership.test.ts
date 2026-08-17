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
  return collectSourceFiles(entryPath).flatMap((filePath) => {
    const source = readRepoFile(filePath);
    const matches = source.matchAll(
      /import\s+(type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["'];/g,
    );

    return Array.from(matches, (match) => ({
      filePath,
      importPath: match[2],
      isTypeOnly: Boolean(match[1]),
      resolvedPath: resolveRepoImport(filePath, match[2]),
    }));
  });
}

function extractButtonVariantNames(buttonSource: string) {
  const variantStart = buttonSource.indexOf("variant: {");
  const sizeStart = buttonSource.indexOf("\n      },\n      size:", variantStart);

  if (variantStart === -1 || sizeStart === -1) {
    throw new Error("Unable to locate Button variant block");
  }

  const variantBlock = buttonSource.slice(variantStart, sizeStart);
  const variantNames = variantBlock.matchAll(/^\s{8}([A-Za-z][A-Za-z0-9_]*)\s*:/gm);

  return Array.from(variantNames, (match) => match[1]);
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

  it("keeps common components independent from app, feature, and domain data modules", () => {
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
      "lib/convex/",
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

  it("documents temporary Button recipe variants while migration continues", () => {
    const buttonSource = readRepoFile("src/components/ui/button.tsx");
    const docsSource = readRepoFile("docs/ui-system.md");
    const currentVariantNames = extractButtonVariantNames(buttonSource);
    const composedRecipeNamePattern =
      /(?:card|list|suggestion|tab|tag|search|picker|option|row|menu|toolbar)/i;
    const documentedMigrationAllowlist = [
      "card",
      "listItem",
      "suggestion",
      "suggestionActive",
      "tabPrimary",
      "tabPrimaryDisabled",
      "tabSecondary",
      "tagRemove",
    ];
    const undocumentedComposedRecipes = currentVariantNames.filter(
      (variantName) =>
        composedRecipeNamePattern.test(variantName) &&
        !documentedMigrationAllowlist.includes(variantName),
    );
    const missingDocsEntries = documentedMigrationAllowlist.filter(
      (variantName) => !docsSource.includes(`\`${variantName}\``),
    );

    expect(undocumentedComposedRecipes).toEqual([]);
    expect(missingDocsEntries).toEqual([]);
  });

  it("documents ownership for shared UI dependencies", () => {
    const docsSource = readRepoFile("docs/ui-system.md");
    const dependencyTerms = [
      "@iconify/react",
      "lucide-react",
      "framer-motion",
      "react-simple-code-editor",
      "prismjs",
      "diff",
    ];

    expect(dependencyTerms.filter((term) => !docsSource.includes(term))).toEqual([]);
  });
});
