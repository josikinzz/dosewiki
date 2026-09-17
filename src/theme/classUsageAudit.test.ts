import { describe, expect, it } from "vitest";
import { auditClassUsage, findNewClassUsageFindings } from "./classUsageAudit";

const utilities = {
  filePath: "src/styles/utilities-theme.css",
  text: [
    ".theme-china-countup { transition: opacity 200ms; }",
    ".theme-interaction-danger .theme-interaction-expanded-toggle-danger { color: red; }",
    ".theme-public-card { border: 0; }",
    ".theme-only-in-tests { color: blue; }",
  ].join("\n"),
};

const lightSheet = {
  filePath: "src/styles/theme-light-mode.css",
  text: [
    'html[data-theme="light"] :is([class~="text-white/78"], [class~="text-white/60"]) { color: red !important; }',
    'html[data-theme="light"] .ring-white\\/20 { --tw-ring-color: red !important; }',
    'html[data-theme="light"] .theme-public-card { background: white !important; }',
  ].join("\n"),
};

const sources = [
  {
    filePath: "src/components/common/Card.tsx",
    text: 'export const Card = () => <div className="theme-public-card ring-white/20" />;',
  },
  {
    filePath: "src/features/article/Interactions.tsx",
    text: "const cls = `theme-interaction-expanded-toggle-${tone} theme-interaction-danger`;",
  },
  {
    filePath: "src/components/common/Card.test.tsx",
    text: 'expect(el.className).toContain("theme-only-in-tests"); className="text-white/78"',
  },
  {
    // Generic stems in templates are ids and data keys, never class stems; they
    // must not keep text-white/* alive.
    filePath: "src/features/gallery/Group.tsx",
    text: "const id = `group-${index}`; const cls = `text-${tone}`;",
  },
];

describe("theme class usage audit", () => {
  const findings = auditClassUsage({ stylesheets: [utilities, lightSheet], sources });

  it("reports a theme class with no runtime consumer", () => {
    expect(findings).toContainEqual({
      rule: "unused-theme-class",
      filePath: "src/styles/utilities-theme.css",
      line: 1,
      match: "theme-china-countup",
    });
  });

  it("treats a template-built class name as live", () => {
    const unused = findings.filter((f) => f.rule === "unused-theme-class").map((f) => f.match);
    expect(unused).not.toContain("theme-interaction-expanded-toggle-danger");
    expect(unused).not.toContain("theme-interaction-danger");
    expect(unused).not.toContain("theme-public-card");
  });

  it("does not count a test file as a consumer", () => {
    expect(findings).toContainEqual({
      rule: "unused-theme-class",
      filePath: "src/styles/utilities-theme.css",
      line: 4,
      match: "theme-only-in-tests",
    });
  });

  it("reports a light-sheet remap target that no runtime source emits, with its sheet line", () => {
    const remaps = findings.filter((f) => f.rule === "unused-light-remap");
    expect(remaps).toEqual([
      { rule: "unused-light-remap", filePath: "src/styles/theme-light-mode.css", line: 1, match: "text-white/78" },
      { rule: "unused-light-remap", filePath: "src/styles/theme-light-mode.css", line: 1, match: "text-white/60" },
    ]);
  });

  it("can fail only on findings absent from a reviewed baseline", () => {
    const [grandfathered, ...rest] = findings;
    expect(findNewClassUsageFindings(findings, [grandfathered])).toEqual(rest);
  });
});
