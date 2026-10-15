import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const EM_DASH = "\u2014";
export const SCANNED_ROOTS = Object.freeze(["content", "src", "lib", "server", "docs", "README.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "data/README.md"]);
export const BASELINE_PATH = "scripts/lint/em-dash-comment-baseline.json";
export const BASELINE_CEILING = 1776;

const CODE_FILE = /\.(?:[cm]?js|jsx|tsx?)$/;
const STYLESHEET = /\.css$/;
const BINARY_FILE = /\.(?:png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|zip|gz|pdf|mp[34]|webm|wasm)$/i;
const LITERAL_KINDS = new Set([
  ts.SyntaxKind.JsxText,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
]);

function occurrences(text, from = 0, to = text.length) {
  const offsets = [];
  for (let index = text.indexOf(EM_DASH, from); index !== -1 && index < to; index = text.indexOf(EM_DASH, index + 1)) {
    offsets.push(index);
  }
  return offsets;
}

function lineOf(text, offset) {
  let line = 1;
  for (let index = text.indexOf("\n"); index !== -1 && index < offset; index = text.indexOf("\n", index + 1)) line += 1;
  return line;
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

export function scanEmDashes(file, text) {
  const all = occurrences(text);
  if (all.length === 0) return { violations: [], comments: 0 };
  if (STYLESHEET.test(file)) return { violations: [], comments: all.length };
  if (!CODE_FILE.test(file)) {
    return { violations: all.map((offset) => ({ file, line: lineOf(text, offset) })), comments: 0 };
  }

  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const inLiterals = new Set();
  const visit = (node) => {
    if (LITERAL_KINDS.has(node.kind)) {
      for (const offset of occurrences(text, node.getStart(source), node.getEnd())) inLiterals.add(offset);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const violations = [...inLiterals].sort((a, b) => a - b).map((offset) => ({ file, line: lineOf(text, offset) }));
  return { violations, comments: all.length - inLiterals.size };
}

export function compareToBaseline(actual, baseline, ceiling = BASELINE_CEILING) {
  const problems = [];
  const allowedTotal = Object.values(baseline).reduce((sum, count) => sum + count, 0);
  if (allowedTotal > ceiling) {
    problems.push(`The baseline allows ${allowedTotal} comment em dashes, above its ceiling of ${ceiling}. Rewrite the new comments instead of growing the baseline.`);
  }
  for (const file of new Set([...Object.keys(actual), ...Object.keys(baseline)])) {
    const found = actual[file] ?? 0;
    const allowed = baseline[file] ?? 0;
    if (found > allowed) {
      problems.push(`${file} has ${found} comment em dash${found === 1 ? "" : "es"}; the baseline allows ${allowed}. Rewrite the new comment without one.`);
    }
  }
  return problems;
}

export function listScannedFiles(repoRoot) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...SCANNED_ROOTS], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file && !BINARY_FILE.test(file));
}

export function checkRepository(repoRoot) {
  const violations = [];
  const comments = {};
  for (const file of listScannedFiles(repoRoot)) {
    let text;
    try {
      text = readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    const scan = scanEmDashes(file, text);
    violations.push(...scan.violations);
    if (scan.comments > 0) comments[file] = scan.comments;
  }
  const baseline = JSON.parse(readFileSync(path.join(repoRoot, BASELINE_PATH), "utf8"));
  return { violations, comments, baseline, baselineProblems: compareToBaseline(comments, baseline) };
}
