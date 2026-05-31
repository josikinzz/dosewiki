import fs from "node:fs";
import path from "node:path";

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

type ThemeTokenAuditPattern = {
  rule: ThemeTokenAuditRule;
  pattern: RegExp;
};

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
    finding.line,
    finding.column,
    finding.match,
  ].join("|");
}

export function findNewThemeTokenFindings(
  findings: readonly ThemeTokenAuditFinding[],
  reviewedBaseline: readonly ThemeTokenAuditFinding[],
) {
  const reviewedFindingKeys = new Set(reviewedBaseline.map(themeTokenFindingKey));

  return findings.filter((finding) => !reviewedFindingKeys.has(themeTokenFindingKey(finding)));
}
