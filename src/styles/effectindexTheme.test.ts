import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards for the Effect Index skin. The properties asserted here are
 * the ones that fail silently rather than loudly: a rule that forgets the site
 * scope leaks the skin onto dose.wiki, an import that is not last loses the
 * cascade, and an <image>-typed token flattened to a bare colour is dropped by
 * the CSS parser with no error anywhere.
 *
 * Paths are resolved from the repo root rather than from an env var so the
 * suite reads the same files the build does, on either flavor.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SKIN_PATH = path.join(REPO_ROOT, "src", "styles", "effectindex-theme.css");
const ENTRY_PATH = path.join(REPO_ROOT, "src", "styles.css");

const SITE_SCOPE = '[data-site="effectindex"]';

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

/** Strip comments so selectors inside prose are not mistaken for rules. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Every selector in the sheet, flattened across at-rule nesting. Declaration
 * blocks are skipped by only collecting the text that precedes an opening brace
 * once the preceding block has closed.
 */
function selectorsOf(css: string): string[] {
  const selectors: string[] = [];
  const source = stripComments(css);
  const pattern = /([^{}]+)\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const raw = match[1].replace(/\s+/g, " ").trim();
    if (!raw || raw.startsWith("@")) continue;
    selectors.push(raw);
  }

  return selectors;
}

/**
 * Split a selector list on its TOP-LEVEL commas only.
 *
 * A plain `split(",")` also cuts inside `:is(a, b)` and inside escaped
 * commas in Tailwind arbitrary values such as
 * `.from-\[color-mix\(in_srgb\,\#701a75_20\%\,var\(--x\)\)\]`, producing
 * fragments like `.theme-plateau-tier-expanded)` that carry no site scope
 * and look like leaks when the rule they came from is correctly scoped.
 */
function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < selector.length; i += 1) {
    const char = selector[i];

    // A backslash escapes the next character, including `,` and `(`.
    if (char === "\\") {
      current += char + (selector[i + 1] ?? "");
      i += 1;
      continue;
    }

    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

describe("effect index skin", () => {
  const skin = read(SKIN_PATH);

  it("is the final import in the global style chain and is unlayered", () => {
    const imports = [...read(ENTRY_PATH).matchAll(/@import\s+"([^"]+)"([^;]*);/g)];
    const last = imports[imports.length - 1];

    expect(last?.[1]).toBe("./styles/effectindex-theme.css");
    // No `layer(...)` qualifier: unlayered rules beat every layered rule
    // regardless of specificity, which is how the skin overrides Tailwind
    // call-site utilities without !important.
    expect(last?.[2].trim()).toBe("");
  });

  it("scopes every selector to the site attribute, so it is inert on dose.wiki", () => {
    const unscoped = selectorsOf(skin)
      .flatMap(splitSelectorList)
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.includes(SITE_SCOPE));

    expect(unscoped).toEqual([]);
  });

  it("keeps both image-typed tokens image-typed when flattened", () => {
    // A custom property flattened to a bare colour is silently dropped by
    // `background-image:` and by Tailwind's
    // `bg-[image:var(--theme-horizontal-divider-image)]` utility, so
    // these two must stay gradients even though the skin is flat.
    for (const token of [
      "--theme-horizontal-divider-image",
      "--theme-article-hero-summary-divider",
    ]) {
      const declaration = new RegExp(`${token}:\\s*linear-gradient\\(`);
      expect(skin).toMatch(declaration);
    }
  });

  it("scopes the divider image to the site attribute alone, not to the theme", () => {
    // site-colors.css declares --theme-horizontal-divider-image only in its
    // dark :root block; the light block never redefines it. An override scoped
    // to [data-site][data-theme="light"] would therefore never apply.
    const source = stripComments(skin);
    const block = source.slice(0, source.indexOf("--theme-horizontal-divider-image"));
    const owningSelector = block.slice(block.lastIndexOf("}") + 1).replace(/\{[\s\S]*$/, "");

    expect(owningSelector).toContain(SITE_SCOPE);
    expect(owningSelector).not.toContain("data-theme");
  });

  it("disables backdrop filters with the one warranted !important", () => {
    // lightbox.css ships in a lazily imported chunk and lands in <head> after
    // this sheet, so source order cannot be relied on there.
    expect(skin).toMatch(/backdrop-filter:\s*none\s*!important/);
    expect(skin).toMatch(/-webkit-backdrop-filter:\s*none\s*!important/);
  });

  it("leaves the semantic safety ramp alone", () => {
    const safetyTokens = [
      "--theme-success-text",
      "--theme-warning-text",
      "--theme-danger-text",
      "--theme-evidence-text",
      "--theme-semantic-danger-badge-text",
      "--theme-semantic-unsafe-badge-text",
      "--theme-semantic-caution-badge-text",
    ];

    for (const token of safetyTokens) {
      expect(skin).not.toContain(`${token}:`);
    }
  });
});
