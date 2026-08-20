import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS,
  REVIEWED_THEME_TOKEN_AUDIT_BASELINE,
  THEME_TOKEN_AUDIT_BASELINE,
  auditThemeTokenFiles,
  auditThemeTokenFilesAgainstBaseline,
  auditThemeTokenText,
  findNewThemeTokenFindings,
} from "./tokenAudit";

describe("theme token audit", () => {
  it("scans public routes, route-owned page components, and feature presentation by default", () => {
    expect(DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS).toEqual([
      "src/app",
      "src/components/common",
      "src/components/layout",
      "src/components/pages",
      "src/components/ui",
      "src/features",
    ]);
  });

  it("reports raw shared UI styling escapes without enforcing a clean repo yet", () => {
    const findings = auditThemeTokenText(
      [
        `className="text-white/70 border-white/10 bg-white/5 text-fuchsia-300 bg-white/[0.045]"`,
        `style={{ color: "var(--theme-text-primary)" }}`,
        `.label { letter-spacing: -0.01em; }`,
      ].join("\n"),
      "src/components/ui/example.tsx",
    );

    expect(findings.map((finding) => finding.rule)).toEqual([
      "raw-white-text",
      "raw-white-background",
      "raw-white-border",
      "raw-fuchsia-text",
      "raw-white-arbitrary-background",
      "direct-theme-variable",
      "negative-letter-spacing",
    ]);
  });

  it("allows token implementation files to use raw variables", () => {
    const findings = auditThemeTokenText(
      `.theme-text-secondary { color: var(--theme-text-secondary); }`,
      "src/styles/utilities-theme.css",
    );

    expect(findings).toEqual([]);
  });

  it("can scan the shared UI surface in report mode", () => {
    const findings = auditThemeTokenFiles(["src/components/ui/button.tsx"]);

    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
  });

  it("can fail only on findings absent from a reviewed baseline", () => {
    const source = `className="text-white/70 text-fuchsia-300"`;
    const [grandfatheredFinding, newFinding] = auditThemeTokenText(
      source,
      "src/features/example/Panel.tsx",
    );

    expect(
      findNewThemeTokenFindings([grandfatheredFinding, newFinding], [grandfatheredFinding]),
    ).toEqual([newFinding]);
  });

  it("loads a reviewed baseline for existing token audit findings", () => {
    expect(THEME_TOKEN_AUDIT_BASELINE.schemaVersion).toBe(1);
    expect(THEME_TOKEN_AUDIT_BASELINE.reviewScope).toBe(
      "production push shared public UI token audit review",
    );
    expect(THEME_TOKEN_AUDIT_BASELINE.scanRoots).toEqual(DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS);
    expect(REVIEWED_THEME_TOKEN_AUDIT_BASELINE.length).toBeGreaterThan(0);
    expect(
      findNewThemeTokenFindings(
        REVIEWED_THEME_TOKEN_AUDIT_BASELINE,
        REVIEWED_THEME_TOKEN_AUDIT_BASELINE,
      ),
    ).toEqual([]);
  });

  it("treats the reviewed baseline as the current migration gate", () => {
    const report = auditThemeTokenFilesAgainstBaseline();

    expect(report.reviewedBaseline).toBe(REVIEWED_THEME_TOKEN_AUDIT_BASELINE);
    expect(report.newFindings).toEqual([]);
  });
});
