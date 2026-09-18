import { describe, expect, it } from "vitest";
import {
  auditThemeTokenText,
  findNewThemeTokenFindings,
} from "./tokenAudit";

describe("theme token audit", () => {

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

  it("flags raw accent utilities and accent hexes in component class and style text", () => {
    const findings = auditThemeTokenText(
      [
        `className="ring-fuchsia-400/40 hover:decoration-violet-300/35 from-[color-mix(in_srgb,#d946ef_25%,transparent)]"`,
        `style={{ boxShadow: "0 0 24px #8B5CF6" }}`,
      ].join("\n"),
      "src/components/ui/example.tsx",
    );

    expect(findings.map((finding) => [finding.rule, finding.match])).toEqual([
      ["raw-accent-utility", "ring-fuchsia-400/40"],
      ["raw-accent-utility", "hover:decoration-violet-300/35"],
      ["raw-accent-hex", "from-[color-mix(in_srgb,#d946ef_25%,transparent)]"],
      ["raw-accent-hex", "#8B5CF6"],
    ]);
  });

  it("keeps token-backed accent styling and palette data unflagged", () => {
    expect(
      auditThemeTokenText(
        `className="text-dose-accent-strong ring-[rgb(var(--c-brand)/0.35)] from-[color-mix(in_srgb,rgb(var(--c-brand))_25%,transparent)]"`,
        "src/components/ui/example.tsx",
      ),
    ).toEqual([]);

    expect(
      auditThemeTokenText(
        `funDark: ["#110617", "#d946ef", "#f0abfc"],`,
        "src/features/theme-lab/palettePresets.ts",
      ),
    ).toEqual([]);

    expect(
      auditThemeTokenText(
        `.accent-seed { color: #d946ef; }`,
        "src/styles/utilities-theme.css",
      ),
    ).toEqual([]);
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

});
