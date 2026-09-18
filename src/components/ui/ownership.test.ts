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

/**
 * Axis names each shared component's `cva` variants object may declare. The
 * vocabulary lives in docs/design/ui-kit.md ("Variant Axis Vocabulary"); this is the
 * enforcement. `size` collides with the native attribute on <input> and <select>,
 * so the three field primitives carry a prefixed size axis as recorded exceptions.
 */
const VARIANT_AXIS_VOCABULARY = ["variant", "size", "tone", "selected", "padding", "radius"];
const VARIANT_AXIS_EXCEPTIONS: Record<string, string[]> = {
  "src/components/ui/input.tsx": ["inputSize"],
  "src/components/ui/select.tsx": ["selectSize"],
  "src/components/ui/textarea.tsx": ["textareaSize"],
};

/** Top-level keys of every `variants: { … }` object inside a `cva(` call. */
function collectVariantAxes(entryPath: string) {
  return readSourceFiles([entryPath], { extensions: /\.tsx?$/ }).flatMap(({ path: filePath, text }) => {
    if (/\.test\.tsx?$/.test(filePath)) return [];
    const axes: { filePath: string; axis: string }[] = [];
    for (const match of text.matchAll(/\bvariants\s*:\s*\{/g)) {
      let depth = 1;
      let i = match.index + match[0].length;
      while (i < text.length && depth > 0) {
        const ch = text[i];
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
        else if (depth === 1) {
          const key = /^\s*([A-Za-z_$][\w$]*)\s*:\s*\{/.exec(text.slice(i, i + 80));
          if (key && (i === 0 || /[\s{,]/.test(text[i - 1]))) {
            axes.push({ filePath, axis: key[1] });
            i += key[0].length - 1;
            depth += 1;
          }
        }
        i += 1;
      }
    }
    return axes;
  });
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

  it("names every shared variant axis from the documented vocabulary", () => {
    const offAxis = ["src/components/ui", "src/components/common", "src/components/layout"]
      .flatMap(collectVariantAxes)
      .filter(
        ({ filePath, axis }) =>
          !VARIANT_AXIS_VOCABULARY.includes(axis) &&
          !(VARIANT_AXIS_EXCEPTIONS[filePath] ?? []).includes(axis),
      )
      .map(({ filePath, axis }) => `${filePath}: ${axis}`);

    expect(offAxis).toEqual([]);
  });

  it("reads corner roles, not Tailwind radius sizes, in the primitives tier", () => {
    // The geometry tokens (--radius-control/-chip/-card/-panel/-pill) carry a value per
    // visual style; a size utility bypasses them and Pro has to re-square it by selector.
    const sizeUtilities = readSourceFiles(["src/components/ui"], { extensions: /\.tsx$/ }).flatMap(
      ({ path: filePath, text }) =>
        /\.test\.tsx$/.test(filePath)
          ? []
          : Array.from(
              text.matchAll(/(?<![\w-])rounded(?:-(?:sm|md|lg|xl|2xl|3xl|\[[^\]]+\]))?(?![\w-])(?=[\s"'`])/g),
              (match) => `${filePath}: ${match[0]}`,
            ),
    );

    expect(sizeUtilities).toEqual([]);
  });

});
