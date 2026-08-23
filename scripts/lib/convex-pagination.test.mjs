import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  drainConvexPageQuery,
  getUniqueSubstanceDocumentBySlug,
} from "./convex-pagination.mjs";

const DEPRECATED_SUBSTANCE_QUERIES = new Set([
  "getAll",
  "getEditorAll",
  "getLookup",
  "getPublicLookup",
  "getPublicPreviews",
  "getLibraryInput",
  "getPublicLibraryInput",
  "getPublicCoverageInput",
  "getSearchInput",
  "getPublicMechanismRouteInput",
  "getRandomSample",
  "replaceAllSubstances",
]);

function activeSourceFiles(root) {
  const results = [];
  for (const entry of readdirSync(root)) {
    if (["runs", "node_modules"].includes(entry)) continue;
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      results.push(...activeSourceFiles(path));
    } else if (
      /\.(?:mjs|js|ts|tsx)$/.test(entry)
      && !/\.(?:test|spec)\.(?:mjs|js|ts|tsx)$/.test(entry)
    ) {
      results.push(path);
    }
  }
  return results;
}

function staticPropertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
      return argument.text;
    }
  }
  return null;
}

function bindingPropertyName(element) {
  if (element.propertyName) {
    return ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)
      ? element.propertyName.text
      : null;
  }
  return ts.isIdentifier(element.name) ? element.name.text : null;
}

function isSubstanceIndexAccess(node) {
  return (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    && staticPropertyName(node) === "substanceIndex";
}

function collectDeprecatedSubstanceQueryAccesses(sourceText, fileName = "source.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const substanceAliases = new Set();
  const findings = [];
  const report = (node, queryName) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({ queryName, line: line + 1, column: character + 1 });
  };

  const inspectSubstanceBinding = (binding, reportNode) => {
    if (ts.isIdentifier(binding)) {
      substanceAliases.add(binding.text);
      return;
    }
    if (!ts.isObjectBindingPattern(binding)) return;
    for (const element of binding.elements) {
      const queryName = bindingPropertyName(element);
      if (queryName && DEPRECATED_SUBSTANCE_QUERIES.has(queryName)) {
        report(reportNode ?? element, queryName);
      }
    }
  };

  const collectAliases = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (isSubstanceIndexAccess(node.initializer)) {
        inspectSubstanceBinding(node.name, node);
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (bindingPropertyName(element) !== "substanceIndex") continue;
          inspectSubstanceBinding(element.name, element);
        }
      }
    }
    ts.forEachChild(node, collectAliases);
  };
  collectAliases(sourceFile);

  const inspectAccesses = (node) => {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const queryName = staticPropertyName(node);
      if (queryName && DEPRECATED_SUBSTANCE_QUERIES.has(queryName)) {
        const receiver = node.expression;
        if (isSubstanceIndexAccess(receiver) || (ts.isIdentifier(receiver) && substanceAliases.has(receiver.text))) {
          report(node, queryName);
        }
      }
    }
    ts.forEachChild(node, inspectAccesses);
  };
  inspectAccesses(sourceFile);
  return findings;
}

describe("drainConvexPageQuery", () => {
  it("drains multiple pages in deterministic page order and clamps page size to 32", async () => {
    const query = {};
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ page: [{ id: 1 }, { id: 2 }], isDone: false, continueCursor: "next" })
        .mockResolvedValueOnce({ page: [{ id: 3 }], isDone: true, continueCursor: "ignored" }),
    };
    await expect(drainConvexPageQuery({ client, query, pageSize: 999 })).resolves.toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    expect(client.query).toHaveBeenNthCalledWith(1, query, {
      paginationOpts: { cursor: null, numItems: 32 },
    });
    expect(client.query).toHaveBeenNthCalledWith(2, query, {
      paginationOpts: { cursor: "next", numItems: 32 },
    });
  });

  it("rejects malformed pages and unusable or stalled cursors", async () => {
    await expect(drainConvexPageQuery({
      client: { query: vi.fn().mockResolvedValue({ page: "bad", isDone: true, continueCursor: null }) },
      query: {},
    })).rejects.toThrow(/page\[\]/);
    await expect(drainConvexPageQuery({
      client: { query: vi.fn().mockResolvedValue({ page: [], isDone: false, continueCursor: null }) },
      query: {},
    })).rejects.toThrow(/unfinished without a usable/);
    const stalledClient = {
      query: vi.fn()
        .mockResolvedValueOnce({ page: [], isDone: false, continueCursor: "same" })
        .mockResolvedValueOnce({ page: [], isDone: false, continueCursor: "same" }),
    };
    await expect(drainConvexPageQuery({ client: stalledClient, query: {} })).rejects.toThrow(/cursor stalled/);
  });

  it("loads a slug through the guarded full-document drain and rejects duplicates", async () => {
    const query = {};
    const uniqueClient = {
      query: vi.fn().mockResolvedValue({
        page: [{ slug: "other" }, { slug: "target", id: 1 }],
        isDone: true,
        continueCursor: null,
      }),
    };
    await expect(
      getUniqueSubstanceDocumentBySlug(uniqueClient, query, "target"),
    ).resolves.toEqual({ slug: "target", id: 1 });
    expect(uniqueClient.query).toHaveBeenCalledWith(query, {
      paginationOpts: { cursor: null, numItems: 32 },
    });

    const duplicateClient = {
      query: vi.fn().mockResolvedValue({
        page: [{ slug: "target", id: 1 }, { slug: "target", id: 2 }],
        isDone: true,
        continueCursor: null,
      }),
    };
    await expect(
      getUniqueSubstanceDocumentBySlug(duplicateClient, query, "target"),
    ).rejects.toThrow('Expected one substance for slug "target", found 2');
  });

  it("fails closed at max page and row guards", async () => {
    await expect(drainConvexPageQuery({
      client: { query: vi.fn().mockResolvedValue({ page: [], isDone: false, continueCursor: "next" }) },
      query: {},
      maxPages: 1,
    })).rejects.toThrow(/maxPages/);
    await expect(drainConvexPageQuery({
      client: { query: vi.fn().mockResolvedValue({ page: [1, 2], isDone: true, continueCursor: null }) },
      query: {},
      maxRows: 1,
    })).rejects.toThrow(/maxRows/);
  });

  it("detects deprecated query access across property, bracket, and destructuring syntax", () => {
    const rejectedForms = [
      ["api.substanceIndex.getAll", "getAll"],
      ["api[\"substanceIndex\"][\"getAll\"]", "getAll"],
      ["const { getAll: loadEverything } = queryApi.substanceIndex", "getAll"],
      ["const substance = generatedApi.substanceIndex; substance.getAll", "getAll"],
      ["const { substanceIndex: substance } = generatedApi; substance[\"getAll\"]", "getAll"],
      ["const { substanceIndex: { getAll: loadEverything } } = generatedApi", "getAll"],
      ["api.substanceIndex.getRandomSample", "getRandomSample"],
    ];
    for (const [source, queryName] of rejectedForms) {
      expect(collectDeprecatedSubstanceQueryAccesses(source), source).toEqual([
        expect.objectContaining({ queryName }),
      ]);
    }
    expect(collectDeprecatedSubstanceQueryAccesses([
      "api.substanceIndex.getAllPage",
      "api[\"substanceIndex\"][\"getLookupPage\"]",
      "const { getAllPage: loadEveryPage } = queryApi.substanceIndex",
    ].join(";\n"))).toEqual([]);
  });

  it("keeps active app and script callers off every deprecated whole-corpus substance projection", () => {
    const activeRoots = ["src", "lib", "scripts"]
      .map((directory) => join(process.cwd(), directory));
    const offenders = activeRoots
      .flatMap(activeSourceFiles)
      .flatMap((path) => collectDeprecatedSubstanceQueryAccesses(readFileSync(path, "utf8"), path)
        .map((finding) => `${relative(process.cwd(), path)}:${finding.line}:${finding.column} (${finding.queryName})`));
    expect(offenders).toEqual([]);
  }, 15_000);
});
