import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import themeTokenAuditBaselineJson from "./theme-token-audit-baseline.json";

export type ThemeTokenAuditRule =
  | "raw-white-text"
  | "raw-white-background"
  | "raw-white-border"
  | "raw-fuchsia-text"
  | "raw-white-arbitrary-background"
  | "direct-theme-variable"
  | "negative-letter-spacing";

export type ThemeTokenAuditFinding = {
  rule: ThemeTokenAuditRule;
  filePath: string;
  line: number;
  column: number;
  match: string;
};

export type ThemeTokenAuditBaseline = {
  schemaVersion: 1;
  reviewedAt: string;
  reviewScope: string;
  scanRoots: readonly string[];
  findings: readonly ThemeTokenAuditFinding[];
};

export type ThemeTokenAuditReport = {
  findings: readonly ThemeTokenAuditFinding[];
  reviewedBaseline: readonly ThemeTokenAuditFinding[];
  newFindings: readonly ThemeTokenAuditFinding[];
};

type ThemeTokenAuditPattern = {
  rule: ThemeTokenAuditRule;
  pattern: RegExp;
};

export const THEME_TOKEN_AUDIT_BASELINE =
  themeTokenAuditBaselineJson as ThemeTokenAuditBaseline;
export const REVIEWED_THEME_TOKEN_AUDIT_BASELINE = THEME_TOKEN_AUDIT_BASELINE.findings;

const AUDIT_PATTERNS: readonly ThemeTokenAuditPattern[] = [
  {
    rule: "raw-white-text",
    pattern: /\b(?:[\w-]+:)*text-white(?:\/\d{1,3})?\b/g,
  },
  {
    rule: "raw-white-background",
    pattern: /\b(?:[\w-]+:)*bg-white(?:\/\d{1,3})?\b(?!\/\[)/g,
  },
  {
    rule: "raw-white-border",
    pattern: /\b(?:[\w-]+:)*border-white(?:\/\d{1,3})?\b/g,
  },
  {
    rule: "raw-fuchsia-text",
    pattern: /\b(?:[\w-]+:)*text-fuchsia-\d{2,3}(?:\/[\w.]+)?\b/g,
  },
  {
    rule: "raw-white-arbitrary-background",
    pattern: /\b(?:[\w-]+:)*bg-white\/\[[^\]\s]+]/g,
  },
  {
    rule: "direct-theme-variable",
    pattern: /var\(--theme-[^)]+\)/g,
  },
  {
    rule: "negative-letter-spacing",
    pattern: /(?:letter-spacing\s*:\s*-\d*\.?\d+(?:rem|em|px)?|\btracking-\[-[^\]]+])/g,
  },
];

export const DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS = [
  "src/app",
  "src/components/common",
  "src/components/layout",
  "src/components/pages",
  "src/components/ui",
  "src/features",
] as const;

const APPROVED_TOKEN_PATH_PARTS = [
  `${path.sep}src${path.sep}theme${path.sep}`,
  `${path.sep}src${path.sep}styles${path.sep}`,
  `${path.sep}tailwind.config.js`,
] as const;

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);

function lineAndColumnForIndex(text: string, index: number) {
  const beforeMatch = text.slice(0, index);
  const lines = beforeMatch.split("\n");

  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function isApprovedTokenFile(filePath: string) {
  const normalized = path.resolve(filePath);

  return APPROVED_TOKEN_PATH_PARTS.some((part) => normalized.includes(part));
}

function collectFiles(entryPath: string): string[] {
  if (!fs.existsSync(entryPath)) {
    return [];
  }

  const stat = fs.statSync(entryPath);

  if (stat.isFile()) {
    return SCANNED_EXTENSIONS.has(path.extname(entryPath)) ? [entryPath] : [];
  }

  return fs.readdirSync(entryPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(entryPath, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(childPath);
    }

    if (entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      return [childPath];
    }

    return [];
  });
}

export function auditThemeTokenText(text: string, filePath = "<inline>"): ThemeTokenAuditFinding[] {
  if (isApprovedTokenFile(filePath)) {
    return [];
  }

  return AUDIT_PATTERNS.flatMap(({ rule, pattern }) => {
    const matches = Array.from(text.matchAll(pattern));

    return matches.map((match) => {
      const index = match.index ?? 0;
      const position = lineAndColumnForIndex(text, index);

      return {
        rule,
        filePath,
        match: match[0],
        ...position,
      };
    });
  });
}

export function auditThemeTokenFiles(
  scanRoots: readonly string[] = DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS,
) {
  return scanRoots.flatMap((scanRoot) =>
    collectFiles(scanRoot).flatMap((filePath) =>
      auditThemeTokenText(fs.readFileSync(filePath, "utf8"), filePath),
    ),
  );
}

export function themeTokenFindingKey(finding: ThemeTokenAuditFinding) {
  return [
    finding.rule,
    path.normalize(finding.filePath),
    finding.match,
  ].join("|");
}

export function findNewThemeTokenFindings(
  findings: readonly ThemeTokenAuditFinding[],
  reviewedBaseline: readonly ThemeTokenAuditFinding[],
) {
  const reviewedFindingCounts = new Map<string, number>();

  for (const finding of reviewedBaseline) {
    const key = themeTokenFindingKey(finding);
    reviewedFindingCounts.set(key, (reviewedFindingCounts.get(key) ?? 0) + 1);
  }

  return findings.filter((finding) => {
    const key = themeTokenFindingKey(finding);
    const reviewedCount = reviewedFindingCounts.get(key) ?? 0;

    if (reviewedCount > 0) {
      reviewedFindingCounts.set(key, reviewedCount - 1);
      return false;
    }

    return true;
  });
}

export function auditThemeTokenFilesAgainstBaseline(
  scanRoots: readonly string[] = DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS,
  reviewedBaseline: readonly ThemeTokenAuditFinding[] = REVIEWED_THEME_TOKEN_AUDIT_BASELINE,
): ThemeTokenAuditReport {
  const findings = auditThemeTokenFiles(scanRoots);

  return {
    findings,
    reviewedBaseline,
    newFindings: findNewThemeTokenFindings(findings, reviewedBaseline),
  };
}

export function summarizeThemeTokenFindings(findings: readonly ThemeTokenAuditFinding[]) {
  return findings.reduce<Partial<Record<ThemeTokenAuditRule, number>>>(
    (summary, finding) => {
      summary[finding.rule] = (summary[finding.rule] ?? 0) + 1;
      return summary;
    },
    {},
  );
}

export function formatThemeTokenAuditFindings(
  findings: readonly ThemeTokenAuditFinding[],
  limit = 20,
) {
  if (findings.length === 0) {
    return "No unreviewed theme token findings.";
  }

  const renderedFindings = findings.slice(0, limit).map((finding) =>
    [
      `${path.normalize(finding.filePath)}:${finding.line}:${finding.column}`,
      finding.rule,
      JSON.stringify(finding.match),
    ].join(" "),
  );
  const remaining = findings.length - renderedFindings.length;

  if (remaining > 0) {
    renderedFindings.push(`...and ${remaining} more.`);
  }

  return renderedFindings.join("\n");
}

function isDirectCliRun() {
  return process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

function runThemeTokenAuditCli() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    console.log(
      [
        "Usage: bun src/theme/tokenAudit.ts --check [scan-root...]",
        "",
        "Fails when the current scan contains findings absent from src/theme/theme-token-audit-baseline.json.",
      ].join("\n"),
    );
    return;
  }

  const outputJson = args.includes("--json");
  const scanRoots = args.filter((arg) => !arg.startsWith("--"));
  const report = auditThemeTokenFilesAgainstBaseline(
    scanRoots.length > 0 ? scanRoots : DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS,
  );

  if (outputJson) {
    console.log(
      JSON.stringify(
        {
          findings: report.findings.length,
          reviewedBaseline: report.reviewedBaseline.length,
          newFindings: report.newFindings,
          newFindingsByRule: summarizeThemeTokenFindings(report.newFindings),
        },
        null,
        2,
      ),
    );
  } else if (report.newFindings.length > 0) {
    console.error(
      [
        `Theme token audit failed: ${report.newFindings.length} unreviewed finding(s).`,
        formatThemeTokenAuditFindings(report.newFindings),
      ].join("\n"),
    );
  } else {
    console.log(
      `Theme token audit passed: ${report.findings.length} finding(s) are covered by the reviewed baseline.`,
    );
  }

  if (report.newFindings.length > 0) {
    process.exitCode = 1;
  }
}

if (isDirectCliRun()) {
  runThemeTokenAuditCli();
}
