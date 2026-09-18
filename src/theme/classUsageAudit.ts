import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import classUsageBaselineJson from "./theme-class-usage-baseline.json";

/**
 * Cross-file sibling of the token audit. The token audit reads one file at a time
 * and flags raw utilities; this audit reads the authored stylesheets against the
 * runtime source tree and flags two kinds of dead rule:
 *
 * - `unused-theme-class`: a `.theme-*` class a stylesheet defines that no runtime
 *   source references, literally or through a template literal.
 * - `unused-light-remap`: a Tailwind utility the light-mode sheet remaps (through
 *   `[class~="…"]` or an escaped `.foo\/40` selector) that no runtime source emits.
 *
 * Runtime sources exclude `*.test.*`, the stylesheets themselves, and the kit
 * catalog's own stories are included because `/dev/kit` renders them.
 */
export type ClassUsageAuditRule = "unused-theme-class" | "unused-light-remap";

export type ClassUsageAuditFinding = {
  rule: ClassUsageAuditRule;
  filePath: string;
  line: number;
  match: string;
};

export type ClassUsageAuditBaseline = {
  reviewedAt: string;
  findings: ClassUsageAuditFinding[];
};

export type ClassUsageAuditReport = {
  findings: ClassUsageAuditFinding[];
  reviewedBaseline: readonly ClassUsageAuditFinding[];
  newFindings: ClassUsageAuditFinding[];
};

export type ClassUsageAuditInput = {
  stylesheets: readonly { filePath: string; text: string }[];
  sources: readonly { filePath: string; text: string }[];
};

export const CLASS_USAGE_AUDIT_BASELINE = classUsageBaselineJson as ClassUsageAuditBaseline;
export const REVIEWED_CLASS_USAGE_AUDIT_BASELINE = CLASS_USAGE_AUDIT_BASELINE.findings;

export const DEFAULT_CLASS_USAGE_STYLESHEETS = [
  "src/styles/base.css",
  "src/styles/components.css",
  "src/styles/font-type.css",
  "src/styles/fun-flat-glow.css",
  "src/styles/mantras.css",
  "src/styles/pro-theme.css",
  "src/styles/site-colors.css",
  "src/styles/theme-light-mode.css",
  "src/styles/theme-overrides.css",
  "src/styles/theme-status.css",
  "src/styles/utilities-theme.css",
  "src/styles/utilities-typography.css",
  "src/features/dev/dev-tools.css",
  "src/app/china/china.css",
] as const;
export const DEFAULT_CLASS_USAGE_SOURCE_ROOTS = ["src", "lib"] as const;

const LIGHT_SHEET_NAME = "theme-light-mode.css";
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mdx"]);
const THEME_CLASS_PATTERN = /\.(theme-[a-zA-Z0-9_-]+)/g;
const CLASS_ATTRIBUTE_SELECTOR = /\[class~="([^"]+)"\]/g;
const ESCAPED_UTILITY_SELECTOR = /html\[data-theme="light"\][^{]*?\.((?:[^\s{,.:>+~)[\\]|\\.)+)/g;

function stripCssComments(text: string) {
  // Preserve line numbers: replace comment bodies with the same number of newlines.
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ""));
}

function lineForIndex(text: string, index: number) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function isRuntimeSource(filePath: string) {
  const base = path.basename(filePath);
  if (/\.test\.[cm]?[jt]sx?$/.test(base) || /\.spec\.[cm]?[jt]sx?$/.test(base)) return false;
  if (filePath.split(path.sep).includes("styles")) return false;
  return SCANNED_EXTENSIONS.has(path.extname(base));
}

type EmittedNames = { literals: Set<string>; templatePrefixes: Set<string> };

/**
 * Every class-shaped token a runtime source can emit. Template literals contribute
 * their static prefixes when the prefix is itself a theme class stem: `theme-foo-${tone}`
 * yields the prefix `theme-foo-`, and any defined class that starts with it counts as
 * live. Generic stems (`group-${id}`, `text-${tone}`) are ignored: they are ids and
 * data keys far more often than class names, and one of them would keep every
 * utility that shares the stem alive.
 */
function collectEmittedNames(sources: ClassUsageAuditInput["sources"]): EmittedNames {
  const literals = new Set<string>();
  const templatePrefixes = new Set<string>();

  for (const { text } of sources) {
    for (const match of text.matchAll(/[A-Za-z0-9_][A-Za-z0-9_/.[\]-]*/g)) {
      literals.add(match[0]);
    }
    for (const match of text.matchAll(/\b(theme-[A-Za-z0-9_-]*-)\$\{/g)) {
      templatePrefixes.add(match[1]);
    }
  }

  return { literals, templatePrefixes };
}

function isEmitted(name: string, emitted: EmittedNames) {
  if (emitted.literals.has(name)) return true;
  for (const prefix of emitted.templatePrefixes) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

export function auditClassUsage(input: ClassUsageAuditInput): ClassUsageAuditFinding[] {
  const emitted = collectEmittedNames(input.sources.filter((s) => isRuntimeSource(s.filePath)));
  const findings: ClassUsageAuditFinding[] = [];
  const reportedClasses = new Set<string>();

  for (const { filePath, text: rawText } of input.stylesheets) {
    const text = stripCssComments(rawText);

    for (const match of text.matchAll(THEME_CLASS_PATTERN)) {
      const name = match[1];
      if (reportedClasses.has(name) || isEmitted(name, emitted)) continue;
      reportedClasses.add(name);
      findings.push({
        rule: "unused-theme-class",
        filePath,
        line: lineForIndex(text, match.index ?? 0),
        match: name,
      });
    }

    if (path.basename(filePath) !== LIGHT_SHEET_NAME) continue;

    const remapped = new Map<string, number>();
    for (const match of text.matchAll(CLASS_ATTRIBUTE_SELECTOR)) {
      if (!remapped.has(match[1])) remapped.set(match[1], lineForIndex(text, match.index ?? 0));
    }
    for (const match of text.matchAll(ESCAPED_UTILITY_SELECTOR)) {
      const name = match[1].replace(/\\(.)/g, "$1");
      if (name.startsWith("theme-") || remapped.has(name)) continue;
      remapped.set(name, lineForIndex(text, (match.index ?? 0) + match[0].length - match[1].length));
    }
    for (const [name, line] of remapped) {
      if (isEmitted(name, emitted)) continue;
      findings.push({ rule: "unused-light-remap", filePath, line, match: name });
    }
  }

  return findings;
}

function collectFiles(entryPath: string): string[] {
  if (!fs.existsSync(entryPath)) return [];
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) return [entryPath];
  return fs
    .readdirSync(entryPath, { withFileTypes: true })
    .flatMap((entry) => collectFiles(path.join(entryPath, entry.name)));
}

export function auditClassUsageFiles(
  stylesheets: readonly string[] = DEFAULT_CLASS_USAGE_STYLESHEETS,
  sourceRoots: readonly string[] = DEFAULT_CLASS_USAGE_SOURCE_ROOTS,
) {
  return auditClassUsage({
    stylesheets: stylesheets
      .filter((filePath) => fs.existsSync(filePath))
      .map((filePath) => ({ filePath, text: fs.readFileSync(filePath, "utf8") })),
    sources: sourceRoots
      .flatMap(collectFiles)
      .filter(isRuntimeSource)
      .map((filePath) => ({ filePath, text: fs.readFileSync(filePath, "utf8") })),
  });
}

export function classUsageFindingKey(finding: ClassUsageAuditFinding) {
  return [finding.rule, path.normalize(finding.filePath), finding.match].join("|");
}

export function findNewClassUsageFindings(
  findings: readonly ClassUsageAuditFinding[],
  reviewedBaseline: readonly ClassUsageAuditFinding[],
) {
  const reviewed = new Set(reviewedBaseline.map(classUsageFindingKey));
  return findings.filter((finding) => !reviewed.has(classUsageFindingKey(finding)));
}

export function auditClassUsageFilesAgainstBaseline(
  reviewedBaseline: readonly ClassUsageAuditFinding[] = REVIEWED_CLASS_USAGE_AUDIT_BASELINE,
): ClassUsageAuditReport {
  const findings = auditClassUsageFiles();
  return { findings, reviewedBaseline, newFindings: findNewClassUsageFindings(findings, reviewedBaseline) };
}

export function formatClassUsageFindings(findings: readonly ClassUsageAuditFinding[], limit = 40) {
  const lines = findings
    .slice(0, limit)
    .map((f) => `  ${f.rule}  ${f.filePath}:${f.line}  ${f.match}`);
  if (findings.length > limit) lines.push(`  … ${findings.length - limit} more`);
  return lines.join("\n");
}

function isDirectCliRun() {
  const entry = process.argv[1];
  return Boolean(entry) && path.resolve(entry) === fileURLToPath(import.meta.url);
}

function runClassUsageAuditCli() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    console.log(
      [
        "Usage: bun src/theme/classUsageAudit.ts --check | --json | --write-baseline",
        "",
        "Fails when the current scan contains findings absent from src/theme/theme-class-usage-baseline.json.",
      ].join("\n"),
    );
    return;
  }

  const report = auditClassUsageFilesAgainstBaseline();

  if (args.includes("--write-baseline")) {
    const baselinePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "theme-class-usage-baseline.json");
    const baseline: ClassUsageAuditBaseline = {
      reviewedAt: new Date().toISOString().slice(0, 10),
      findings: report.findings,
    };
    fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote ${report.findings.length} finding(s) to ${baselinePath}`);
    return;
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.newFindings.length > 0) {
    console.error(
      [
        `Theme class usage audit failed: ${report.newFindings.length} unreviewed finding(s).`,
        formatClassUsageFindings(report.newFindings),
      ].join("\n"),
    );
  } else {
    console.log(
      `Theme class usage audit passed: ${report.findings.length} finding(s) are covered by the reviewed baseline.`,
    );
  }

  if (report.newFindings.length > 0) process.exitCode = 1;
}

if (isDirectCliRun()) {
  runClassUsageAuditCli();
}
