import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  ARTICLE_SOURCE_DOCUMENT_MAX_BYTES,
  getArticleSourceDocumentSizeBytes,
  isArticleSourceDocumentTooLarge,
  loadLocalArticleSourceDocument,
  normalizeArticleSourceDocument,
  parseLocalArticleSourceModule,
  toDataArticleSourcePayload,
  validateArticleSourceDocument,
} from "../scripts/article-source-documents/contract.mjs";

const SOURCE_META = {
  id: "erowid",
  fileName: "erowid.md",
  displayName: "Erowid",
  size: 12,
  tokens: 3,
};

describe("article source document contract", () => {
  it("normalizes Postgres-shaped documents without changing metadata or source ids", () => {
    const doc = normalizeArticleSourceDocument({
      slug: "fixtureamine",
      substanceName: "Fixtureamine",
      sources: [SOURCE_META],
      contents: { erowid: "Postgres content" },
      _id: "ignored",
    });

    expect(doc).toEqual({
      slug: "fixtureamine",
      substanceName: "Fixtureamine",
      sources: [SOURCE_META],
      contents: { erowid: "Postgres content" },
    });
    expect(toDataArticleSourcePayload(doc)).toEqual(doc);
  });

  it("parses local TypeScript source modules into the same normalized shape", () => {
    const sourceText = [
      'export const substanceName = "Fixtureamine";',
      'export const sources = [{"id":"erowid","fileName":"erowid.md","displayName":"Erowid","size":12,"tokens":3}];',
      'export const contents: Record<string, string> = {',
      '  "erowid": `Local content with an escaped \\` backtick and \\${literal}.`,',
      "};",
    ].join("\n");

    const parsed = parseLocalArticleSourceModule(sourceText, "fixtureamine");

    expect(parsed).toMatchObject({
      slug: "fixtureamine",
      substanceName: "Fixtureamine",
      sources: [SOURCE_META],
    });
    expect(parsed.contents.erowid).toContain("Local content");
    expect(parsed.contents.erowid).toContain("` backtick");
  });

  it("loads local source files as an adapter behind the normalized Interface", () => {
    const dir = mkdtempSync(join(tmpdir(), "dose-source-doc-"));
    const filePath = join(dir, "fixtureamine.ts");
    writeFileSync(
      filePath,
      `export const substanceName = "Fixtureamine";
export const sources = [{"id":"erowid","fileName":"erowid.md","displayName":"Erowid","size":12,"tokens":3}];
export const contents = {"erowid": \`Local content\`};`,
    );

    expect(loadLocalArticleSourceDocument(filePath)).toEqual({
      slug: "fixtureamine",
      substanceName: "Fixtureamine",
      sources: [SOURCE_META],
      contents: { erowid: "Local content" },
    });
  });

  it("reports missing and extra content keys before import or prompt construction", () => {
    const missing = {
      slug: "fixtureamine",
      substanceName: "Fixtureamine",
      sources: [SOURCE_META],
      contents: {},
    };
    const extra = {
      ...missing,
      contents: { erowid: "ok", tripsit: "extra" },
    };

    expect(validateArticleSourceDocument(missing, { allowInvalid: true })).toEqual({
      valid: false,
      errors: ["missing content for source id: erowid"],
    });
    expect(() => normalizeArticleSourceDocument(extra)).toThrow("extra content for source id: tripsit");
  });

  it("allows empty source lists only when contents are also empty", () => {
    expect(
      normalizeArticleSourceDocument({
        slug: "empty",
        substanceName: "Empty",
        sources: [],
        contents: {},
      }),
    ).toMatchObject({ slug: "empty", sources: [], contents: {} });
    expect(() =>
      normalizeArticleSourceDocument({
        slug: "empty",
        substanceName: "Empty",
        sources: [],
        contents: { erowid: "orphaned" },
      }),
    ).toThrow("extra content for source id: erowid");
  });

  it("centralizes the bulk sync size policy", () => {
    const doc = normalizeArticleSourceDocument({
      slug: "fixtureamine",
      substanceName: "Fixtureamine",
      sources: [SOURCE_META],
      contents: { erowid: "x".repeat(128) },
    });

    expect(getArticleSourceDocumentSizeBytes(doc)).toBeGreaterThan(128);
    expect(isArticleSourceDocumentTooLarge(doc, ARTICLE_SOURCE_DOCUMENT_MAX_BYTES)).toBe(false);
    expect(isArticleSourceDocumentTooLarge(doc, 64)).toBe(true);
  });
});
