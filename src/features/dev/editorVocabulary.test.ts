import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { STATUS_DOT } from "./tools/review-mode/ReviewSubstancePicker";
import { REVIEW_STATUS_NAMES } from "./tools/review-mode/reviewStatusNames";
import { REVIEW_STATUS_META } from "./tools/substance-editor/types";

/**
 * Editors read one vocabulary (docs/glossary.md, Editor Vocabulary): Change
 * Review, Publish, Submit for review, working changes. Git, pipeline and
 * transport words never reach a visible string in an editor module. Each
 * entry names the word to use instead, so a failure says how to fix it.
 */
const BANNED: ReadonlyArray<{ pattern: RegExp; use: string }> = [
  // "Baseline Reset" is a tolerance term in article content, not jargon.
  { pattern: /\bbaselines?\b(?! reset)/i, use: "the latest published version, or the version you started from" },
  { pattern: /\brebas(?:e|ed|es|ing)\b/i, use: "merge (Merged Draft) or revision" },
  { pattern: /\breconcil\w*/i, use: "retry to confirm, or merge" },
  { pattern: /\bworking set\b/i, use: "working changes" },
  { pattern: /\bstaged changes?\b/i, use: "Submit for review, or working changes" },
  { pattern: /\bcatalog (?:build|compile)\b/i, use: "the next site release" },
  { pattern: /\bprojections?\b/i, use: "listing, or the page it names" },
  { pattern: /\bpayloads?\b/i, use: "change" },
  { pattern: /\bpipeline\b/i, use: "workflow, or the step it names" },
  { pattern: /\bcommit hash\b/i, use: "revision" },
  { pattern: /\breceipts?\b/i, use: "went through, or confirmed" },
  { pattern: /\bendpoint\b/i, use: "the server" },
  { pattern: /\boperator workflow\b/i, use: "ask an admin" },
  { pattern: /\bview in queue\b/i, use: "Open in Change Review" },
  { pattern: /\bprompt revision\b/i, use: "the name of what changed" },
  { pattern: /\bguarded against\b/i, use: "refused if someone else changed it" },
  { pattern: /\b(?:operation|request) identity\b/i, use: "the original change" },
  { pattern: /\bmutation\b/i, use: "change" },
];

const ROOT = path.resolve(__dirname, "../../..");

/** Editor surfaces: /dev tools, /review, and the editors that open on public pages. */
const EDITOR_DIRS = [
  "src/features/dev",
  "src/features/contextual-editing",
  "src/features/editor-launcher",
  "src/features/article/editing",
  "src/features/effects/editing",
  "src/features/reports/editing",
  "src/features/replications/viewer/editor",
  "src/app/review",
  "src/app/dev",
];
/** Also editor modules, living beside public code. */
const EDITOR_FILE = /\.editor\.tsx?$/;
const EDITOR_FILE_DIRS = ["src/features/replications/artist"];
/** The component catalog documents code for developers; its prose names props and types. */
const EXCLUDED_DIRS = ["src/app/dev/kit"];

function isSourceFile(name: string): boolean {
  return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !/testHarness|\.d\.ts$/.test(name);
}

function walk(dir: string, accept: (name: string) => boolean, out: string[]): void {
  if (EXCLUDED_DIRS.some((excluded) => path.join(ROOT, excluded) === dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, out);
    else if (accept(entry.name)) out.push(full);
  }
}

function editorFiles(): string[] {
  const files: string[] = [];
  for (const dir of EDITOR_DIRS) walk(path.join(ROOT, dir), isSourceFile, files);
  for (const dir of EDITOR_FILE_DIRS) walk(path.join(ROOT, dir), (name) => isSourceFile(name) && EDITOR_FILE.test(name), files);
  return files;
}

/** JSX attributes whose values are code, never shown to an editor. */
const CODE_ATTRIBUTE = /^(className|class|href|src|id|key|type|role|name|value|data-|variant|size|tone|icon|target|rel|method|as|htmlFor|form|lang|dir|mode|autoComplete|inputMode|pattern|accept|aria-controls|aria-labelledby|aria-describedby)/;
/** Calls whose string arguments are code: class lists, requests, storage, DOM and string plumbing. */
const CODE_CALL = /^(cn|clsx|cva|twMerge|console\.\w+|fetch|devFetch|require|import|z\.\w+)$|\.(get|set|has|append|delete|startsWith|endsWith|includes|split|replace|replaceAll|join|push|querySelector|querySelectorAll|closest|getAttribute|setAttribute|addEventListener|removeEventListener|getItem|setItem|removeItem|test|match|localeCompare)$/;

/** False for literals in code positions: imports, types, keys, comparisons, class lists and requests. */
function isVisibleLiteral(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isExternalModuleReference(parent)) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return false;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return false;
  if (ts.isCaseClause(parent)) return false;
  if (ts.isBinaryExpression(parent) && [
    ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
  ].includes(parent.operatorToken.kind)) return false;
  let current: ts.Node = node;
  while (current.parent && !ts.isStatement(current.parent)) {
    current = current.parent;
    if (ts.isJsxAttribute(current)) return !CODE_ATTRIBUTE.test(current.name.getText());
    if (ts.isCallExpression(current)) return !CODE_CALL.test(current.expression.getText());
  }
  return true;
}

interface VisibleString { line: number; text: string }

/** Every string an editor can read in one module: JSX text and prose literals, never comments or identifiers. */
function visibleStrings(fileName: string, source: string): VisibleString[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: VisibleString[] = [];
  const visit = (node: ts.Node) => {
    let text: string | null = null;
    if (ts.isJsxText(node)) text = node.text.replace(/\s+/g, " ").trim();
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isVisibleLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node) && isVisibleLiteral(node)) text = node.head.text + node.templateSpans.map((span) => ` … ${span.literal.text}`).join("");
    // A lone lowercase token is a code value (a status, a key, a mode), not prose.
    if (text && /[A-Za-z]/.test(text) && (ts.isJsxText(node) || /\s/.test(text) || /^[A-Z]/.test(text))) {
      found.push({ line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1, text });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function bannedHits(fileName: string, source: string): string[] {
  const hits: string[] = [];
  for (const { line, text } of visibleStrings(fileName, source)) {
    for (const { pattern, use } of BANNED) {
      if (pattern.test(text)) hits.push(`${fileName}:${line}: "${text.slice(0, 120)}" matches ${pattern}; use ${use}`);
    }
  }
  return hits;
}

describe("editor vocabulary", () => {
  it("reads JSX text and prose literals, and skips comments, identifiers, keys and code values", () => {
    const source = `
      // Refresh the baseline before the rebase.
      const baseline = { reconcile: "projection" };
      const kind = mode === "baseline" ? cn("working set") : fetch("/api/pipeline");
      export function View() {
        return <p className="payload" title="Refresh latest baseline">Reconcile publication {kind}</p>;
      }
      throw new Error("The associations endpoint is unreachable.");
    `;
    expect(bannedHits("Sample.tsx", source).map((hit) => hit.split(" matches ")[0])).toEqual([
      'Sample.tsx:6: "Refresh latest baseline"',
      'Sample.tsx:6: "Reconcile publication"',
      'Sample.tsx:8: "The associations endpoint is unreachable."',
    ]);
  });

  it("keeps git, pipeline and transport jargon out of every editor module", () => {
    const files = editorFiles();
    expect(files.length).toBeGreaterThan(100);
    const hits = files.flatMap((file) => bannedHits(path.relative(ROOT, file), fs.readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });

  it("names review statuses the same way in Substances and /review", () => {
    for (const status of ["needed", "in_progress", "completed"] as const) {
      expect(REVIEW_STATUS_META[status].label).toBe(REVIEW_STATUS_NAMES[status]);
      expect(STATUS_DOT[status].label).toBe(REVIEW_STATUS_NAMES[status]);
    }
    expect(STATUS_DOT.stale.label).toBe(REVIEW_STATUS_NAMES.stale);
    expect(Object.values(REVIEW_STATUS_NAMES)).toEqual(["Not reviewed", "On hold", "Reviewed", "Changed since review"]);
  });
});
