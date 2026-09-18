import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { articleSectionAdornmentClassName } from "./articleSectionLayout";

// Deferred sections have paint containment (content-visibility: auto), which
// clips everything outside their border box. Adornments hang below that box
// by their negative bottom margin, so the deferral rule must enclose exactly
// that overhang in padding and give it back as margin. When the two drift
// apart, source-credit pills and expand toggles silently disappear in
// Chromium while every jsdom render still passes.
describe("article section adornment containment", () => {
  const overhangStep = Number(/(?:^|\s)-mb-(\d+)(?:\s|$)/.exec(articleSectionAdornmentClassName)?.[1]);
  const overhangRem = `${(overhangStep * 0.25).toString()}rem`;

  const css = readFileSync(resolve(__dirname, "../../styles/utilities-theme.css"), "utf8");
  const deferralRule = /\.theme-offscreen-defer\s*\{([^}]*content-visibility:\s*auto[^}]*)\}/.exec(css)?.[1] ?? "";

  it("gives adornments a negative bottom margin to tuck under the next section", () => {
    expect(overhangStep).toBeGreaterThan(0);
  });

  it("pads deferred sections by the adornment overhang", () => {
    expect(deferralRule).toMatch(new RegExp(`padding-bottom:\\s*${overhangRem};`));
  });

  it("cancels the padding so section flow is unchanged", () => {
    expect(deferralRule).toMatch(new RegExp(`margin-bottom:\\s*-${overhangRem};`));
  });
});
