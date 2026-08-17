import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards for the Pro visual style. The properties asserted here are
 * the ones that fail silently rather than loudly: a rule that forgets the style
 * scope leaks Pro onto Fun, a rule that keeps the publication scope leaves Pro
 * unreachable on dose.wiki, an escaped attribute selector matches nothing at
 * all, an import that is not last loses the cascade, a seed that only one
 * scheme defines leaves the other scheme resolving nothing, and an
 * <image>-typed token flattened to a bare colour is dropped by the CSS parser
 * with no error anywhere.
 *
 * Paths are resolved from the repo root rather than from an env var so the
 * suite reads the same files the build does, on either flavor.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SKIN_PATH = path.join(REPO_ROOT, "src", "styles", "pro-theme.css");
const ENTRY_PATH = path.join(REPO_ROOT, "src", "styles.css");
const CONFIG_PATH = path.join(REPO_ROOT, "next.config.ts");
const DOSEWIKI_ENTRY_PATH = path.join(REPO_ROOT, "src", "app", "_styles", "dosewiki.ts");
const EFFECT_INDEX_ENTRY_PATH = path.join(REPO_ROOT, "src", "app", "_styles", "effectindex.ts");

const STYLE_SCOPE = '[data-visual-style="pro"]';
const LIGHT_SCHEME_SCOPE = `${STYLE_SCOPE}[data-theme="light"]`;
const DARK_SCHEME_SCOPE = `${STYLE_SCOPE}[data-theme="dark"]`;

/** The retired publication-scoped skin. Nothing may point at either name. */
const RETIRED_PATHS = ["src/styles/effectindex-theme.css", "src/styles/effectindexTheme.test.ts"];

/** This file names both retired paths in order to forbid them, and it scans itself. */
const GUARD_FILE = "src/styles/proTheme.test.ts";

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

/** Strip comments so selectors and prose inside them are never read as rules. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Every leaf declaration block as a [selector, body] pair. `[^{}]` cannot cross
 * a brace, so an at-rule wrapper never matches as a selector and its nested
 * blocks are returned on their own.
 */
function blocksOf(css: string): { selector: string; body: string }[] {
  const blocks: { selector: string; body: string }[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(stripComments(css))) !== null) {
    const selector = match[1].replace(/\s+/g, " ").trim();
    if (!selector || selector.startsWith("@")) continue;
    blocks.push({ selector, body: match[2] });
  }

  return blocks;
}

/**
 * Split a selector list on its TOP-LEVEL commas only.
 *
 * A plain `split(",")` also cuts inside `:is(a, b)` and inside escaped
 * commas in Tailwind arbitrary values such as
 * `.from-\[color-mix\(in_srgb\,\#701a75_20\%\,var\(--x\)\)\]`, producing
 * fragments like `.theme-plateau-tier-expanded)` that carry no style scope
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

/** Custom-property names declared in a declaration body. */
function declaredProperties(body: string): string[] {
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]);
}

/** Recursively collect source files that could reference a stylesheet path. */
function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    // src/data is ~67 MB of article JSON and imports nothing.
    if (entry.isDirectory()) return entry.name === "data" ? [] : collectSourceFiles(child);
    return /\.(tsx?|css|mjs)$/.test(entry.name) ? [child] : [];
  });
}

describe("pro visual style", () => {
  const skin = read(SKIN_PATH);
  const blocks = blocksOf(skin);

  it("loads the Pro visual style after the shared stylesheet", () => {
    const dosewikiImports = [
      ...read(DOSEWIKI_ENTRY_PATH).matchAll(/import\s+"([^"]+)";/g),
    ].map((match) => match[1]);

    expect(dosewikiImports).toEqual([
      "../../styles.css",
      "../../styles/palette-presets.generated.css",
      "../../styles/pro-theme.css",
    ]);

    const effectIndexImports = [
      ...read(EFFECT_INDEX_ENTRY_PATH).matchAll(/import\s+"([^"]+)";/g),
    ].map((match) => match[1]);

    expect(effectIndexImports).toEqual(["../../styles.css", "../../styles/pro-theme.css"]);
  });

  it("preserves the shared cascade and resolves styles by flavor", () => {
    const commonEntry = read(ENTRY_PATH);
    const config = read(CONFIG_PATH);
    const utilitiesIndex = commonEntry.indexOf("./styles/utilities.css");
    const componentsIndex = commonEntry.indexOf("./styles/components.css");

    expect(utilitiesIndex).toBeGreaterThan(-1);
    expect(componentsIndex).toBeGreaterThan(utilitiesIndex);
    expect(read(EFFECT_INDEX_ENTRY_PATH)).not.toContain("palette-presets.generated.css");
    expect(config).toContain('dosewiki: "./src/app/_styles/dosewiki.ts"');
    expect(config).toContain('effectindex: "./src/app/_styles/effectindex.ts"');
  });

  it("scopes every selector to the style attribute, so it is inert on Fun", () => {
    const unscoped = blocks
      .flatMap((block) => splitSelectorList(block.selector))
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.includes(STYLE_SCOPE));

    expect(unscoped).toEqual([]);
  });

  it("keeps publication identity out of presentation", () => {
    // data-site owns routes, copy, navigation, wordmark strings, metadata and
    // licensing. If it appears here, Pro has stopped being a style and started
    // being a publication again — and dose.wiki readers cannot reach it.
    expect(stripComments(skin)).not.toContain("data-site");
  });

  it("gives both colour schemes the same specificity, and neither one a bare palette", () => {
    const palette = blocks.find((block) => block.selector.includes(LIGHT_SCHEME_SCOPE));
    expect(palette).toBeDefined();

    const selectors = splitSelectorList(palette!.selector).map((part) => part.trim());

    // Unqualified first: the palette must land even if data-theme is missing,
    // so a bootstrap that has not run yet cannot leave Pro unstyled. Then both
    // schemes at (0,2,1), which is what out-ranks the Theme Lab's runtime
    // html[data-theme="…"] overrides — the Lab edits Fun, not Pro.
    expect(selectors).toEqual([
      `html${STYLE_SCOPE}`,
      `html${LIGHT_SCHEME_SCOPE}`,
      `html${DARK_SCHEME_SCOPE}`,
    ]);
  });

  it("expresses the dark scheme as seeds the light palette already defines", () => {
    const paletteBlocks = blocks.filter((block) => block.selector.includes(LIGHT_SCHEME_SCOPE));
    const darkBlocks = blocks.filter(
      (block) => block.selector === `html${DARK_SCHEME_SCOPE}`,
    );

    expect(darkBlocks).toHaveLength(1);

    const seeded = new Set(paletteBlocks.flatMap((block) => declaredProperties(block.body)));
    const redefined = declaredProperties(darkBlocks[0].body);

    expect(redefined.length).toBeGreaterThan(30);
    // A dark-only name is a typo or an orphan: nothing reads it, because every
    // --theme-* binding is declared once, in the block above.
    expect(redefined.filter((name) => !seeded.has(name))).toEqual([]);
    // And the scheme axis stays in the seeds: re-binding a --theme-* token here
    // would mean the two schemes had started to drift into separate systems.
    expect(redefined.filter((name) => name.startsWith("--theme-"))).toEqual([]);
  });

  it("defines every seed it reads", () => {
    const paletteBlocks = blocks.filter((block) => block.selector.includes(LIGHT_SCHEME_SCOPE));
    const seeded = new Set(paletteBlocks.flatMap((block) => declaredProperties(block.body)));
    const referenced = new Set(
      [...stripComments(skin).matchAll(/var\((--ei-[a-z0-9-]+)/g)].map((match) => match[1]),
    );

    expect([...referenced].filter((name) => !seeded.has(name))).toEqual([]);
    expect(referenced.size).toBeGreaterThan(20);
  });

  it("keeps literal colour in the palette, the rails and the theatre", () => {
    // The scheme axis lives in the seeds. A literal below the palette is a
    // value one scheme cannot reach — which is exactly how a sheet written for
    // one scheme rots when a second one arrives. The two exemptions are
    // scheme-independent by nature: the chrome rails are charcoal in BOTH
    // schemes, and the lightbox is a darkened room in both.
    const exempt = [
      LIGHT_SCHEME_SCOPE,
      DARK_SCHEME_SCOPE,
      ".app-header",
      ".app-footer",
      ".yarl__root",
    ];
    const offenders = blocks
      .filter((block) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(|hsl\(/.test(block.body))
      .map((block) => block.selector)
      .filter((selector) => !exempt.some((allowed) => selector.includes(allowed)));

    expect(offenders).toEqual([]);
  });

  it("sets Pro type from the Pro face, not from the build's own face", () => {
    // Effect Index ships Titillium as --font-display and defines no --font-pro;
    // dose.wiki registers it lazily as --font-pro and keeps Blinker on
    // --font-display. The fallback is what lets one declaration serve both.
    for (const token of ["--font-family-body", "--font-family-display"]) {
      expect(skin).toContain(`${token}: var(--font-pro, var(--font-display))`);
    }
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

  it("scopes the divider image to the style attribute alone, not to the theme", () => {
    // site-colors.css declares --theme-horizontal-divider-image only in its
    // dark :root block; the light block never redefines it. An override scoped
    // to [data-visual-style="pro"][data-theme="light"] would therefore never apply.
    const owner = blocks.find((block) =>
      block.body.includes("--theme-horizontal-divider-image:"),
    );

    expect(owner?.selector).toBe(`html${STYLE_SCOPE}`);
  });

  it("disables backdrop filters with the one warranted !important", () => {
    // Kept defensively: a lazily imported chunk's CSS lands in <head> after
    // this sheet, so source order cannot be relied on against one.
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

  it("matches the Effect Index header typography without shrinking its targets", () => {
    const navRule = blocks.find(
      (block) =>
        block.selector === `html${STYLE_SCOPE} .app-header .theme-header-nav-link` &&
        block.body.includes("text-transform"),
    );

    expect(navRule).toBeDefined();
    expect(navRule!.body).toMatch(/font-size:\s*0\.6875rem/);
    expect(navRule!.body).toMatch(/text-transform:\s*uppercase/);
    expect(navRule!.body).toMatch(/letter-spacing:\s*0\.14em/);

    const wordmark = blocks.find(
      (block) =>
        block.selector === `html${STYLE_SCOPE} .app-header .font-display.theme-text-primary`,
    );

    expect(wordmark?.body).toMatch(/font-size:\s*1\.25rem/);
  });

  it("does not run baked Pro molecule colours through Fun palette filters", () => {
    const molecule = blocks.find(
      (block) => block.selector === `html${STYLE_SCOPE} .theme-molecule-image`,
    );

    expect(molecule?.body).toMatch(/--tw-brightness:\s*brightness\(1\)/);
    expect(molecule?.body).toMatch(/--tw-saturate:\s*saturate\(1\)/);
    expect(molecule?.body).toMatch(/--tw-hue-rotate:\s*hue-rotate\(0deg\)/);
  });

  it("gives the Pro homepage an academic hierarchy instead of Fun display sizing", () => {
    const wordmark = blocks.find(
      (block) => block.selector === `html${STYLE_SCOPE} .theme-home-wordmark`,
    );
    const intro = blocks.find(
      (block) => block.selector === `html${STYLE_SCOPE} .theme-home-intro`,
    );
    const quickLinks = blocks.find(
      (block) => block.selector === `html${STYLE_SCOPE} .theme-home-nav-link`,
    );

    expect(wordmark?.body).toMatch(/font-size:\s*clamp\(3rem,\s*5vw,\s*4rem\)/);
    expect(intro?.body).toMatch(/font-size:\s*1\.0625rem/);
    expect(intro?.body).toMatch(/line-height:\s*1\.65/);
    expect(quickLinks?.body).toMatch(/font-size:\s*0\.75rem/);
    expect(quickLinks?.body).toMatch(/font-family:\s*var\(--font-family-display\)/);
    expect(quickLinks?.body).toMatch(/text-transform:\s*uppercase/);
  });

  it("leaves no path to the retired publication-scoped skin", () => {
    for (const retired of RETIRED_PATHS) {
      expect(fs.existsSync(path.join(REPO_ROOT, retired))).toBe(false);
    }

    const stale = collectSourceFiles(path.join(REPO_ROOT, "src"))
      .concat(path.join(REPO_ROOT, "next.config.ts"))
      .map((file) => path.relative(REPO_ROOT, file))
      .filter(
        (file) =>
          file !== GUARD_FILE &&
          /effectindex-theme|effectindexTheme/.test(read(path.join(REPO_ROOT, file))),
      );

    expect(stale).toEqual([]);
  });
});
