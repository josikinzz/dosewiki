import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { userLayerSelector } from "@/features/theme-lab/paletteLabStorage";

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
const SITE_COLORS_PATH = path.join(REPO_ROOT, "src", "styles", "site-colors.css");
const PRESET_CSS_PATH = path.join(REPO_ROOT, "src", "styles", "palette-presets.generated.css");
const ACCENT_CSS_PATH = path.join(REPO_ROOT, "src", "styles", "accent-tokens.generated.css");

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

/** Characters that can appear in an identifier, per CSS Syntax 3. */
const IDENT_CHAR = /[-\w\u00a0-\uffff]/;

/** Selector specificity as [ids, classes, types], per CSS Selectors 4. */
type Specificity = [number, number, number];

/** Index just past the identifier starting at `start`. */
function identEnd(selector: string, start: number): number {
  let i = start;
  while (i < selector.length && (IDENT_CHAR.test(selector[i]) || selector[i] === "\\")) {
    i += selector[i] === "\\" ? 2 : 1;
  }
  return i;
}

/** Index of the `]` or `)` closing the one at `open`; quotes are skipped whole. */
function closingIndex(selector: string, open: number): number {
  const close = selector[open] === "[" ? "]" : ")";
  let depth = 0;

  for (let i = open; i < selector.length; i += 1) {
    const char = selector[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = selector.indexOf(char, i + 1);
      i = end === -1 ? selector.length : end;
      continue;
    }
    if (char === selector[open]) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return selector.length - 1;
}

/**
 * Compute a selector's specificity.
 *
 * The cascade ladder has to be asserted as arithmetic rather than as a string
 * match: a rung is a *rank*, so a future selector edit that quietly reorders
 * two rungs must fail even though every literal in the file still parses. The
 * cases the theme sheets actually use: `:where()` contributes nothing, so the
 * dark-chrome island in site-colors.css stays where its comment says it does;
 * `:is()`/`:not()`/`:has()` contribute their most specific argument; `*` and
 * the combinators contribute nothing; and a repeated attribute counts again,
 * which is the whole mechanism of the lab's user layer.
 */
function specificityOf(selector: string): Specificity {
  const total: Specificity = [0, 0, 0];
  let i = 0;

  while (i < selector.length) {
    const char = selector[i];

    if (char === "\\") {
      i += 2;
    } else if (char === "[") {
      total[1] += 1;
      i = closingIndex(selector, i) + 1;
    } else if (char === "#") {
      total[0] += 1;
      i = identEnd(selector, i + 1);
    } else if (char === ".") {
      total[1] += 1;
      i = identEnd(selector, i + 1);
    } else if (char === ":") {
      const element = selector[i + 1] === ":";
      const nameStart = i + (element ? 2 : 1);
      const nameEnd = identEnd(selector, nameStart);
      const name = selector.slice(nameStart, nameEnd).toLowerCase();

      if (selector[nameEnd] !== "(") {
        total[element ? 2 : 1] += 1;
        i = nameEnd;
        continue;
      }

      const close = closingIndex(selector, nameEnd);
      const args = splitSelectorList(selector.slice(nameEnd + 1, close));

      if (name === "is" || name === "not" || name === "has") {
        const best = args
          .map((part) => specificityOf(part.trim()))
          .reduce<Specificity>(
            (winner, next) => (compareSpecificity(next, winner) > 0 ? next : winner),
            [0, 0, 0],
          );
        for (let axis = 0; axis < 3; axis += 1) total[axis] += best[axis];
      } else if (name !== "where") {
        // :nth-child(2) and friends count as one class; ::slotted() as one type.
        total[element ? 2 : 1] += 1;
      }

      i = close + 1;
    } else if (IDENT_CHAR.test(char)) {
      total[2] += 1;
      i = identEnd(selector, i);
    } else {
      // `*`, whitespace, `>`, `+`, `~` and `,` add nothing.
      i += 1;
    }
  }

  return total;
}

/** Positive when `a` out-ranks `b`, zero on a tie that source order decides. */
function compareSpecificity(a: Specificity, b: Specificity): number {
  for (let axis = 0; axis < 3; axis += 1) {
    if (a[axis] !== b[axis]) return a[axis] - b[axis];
  }
  return 0;
}

/** Every selector in a stylesheet, one per top-level comma. */
function selectorsOf(css: string): string[] {
  return blocksOf(css)
    .flatMap((block) => splitSelectorList(block.selector))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
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

    // Pro after the colourways, and the accent axis after Pro: an accent's Fun block ties a
    // colourway at (0,2,1) and can only win on source order, and its Pro block out-ranks this
    // sheet on specificity so its position costs Pro nothing.
    expect(dosewikiImports).toEqual([
      "../../styles.css",
      "../../styles/palette-presets.generated.css",
      "../../styles/pro-theme.css",
      "../../styles/accent-tokens.generated.css",
    ]);

    const effectIndexImports = [
      ...read(EFFECT_INDEX_ENTRY_PATH).matchAll(/import\s+"([^"]+)";/g),
    ].map((match) => match[1]);

    // No colourways and no accents: this publication locks both, so neither attribute is ever
    // written here and both sheets would be dead bytes on every page.
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
    expect(read(EFFECT_INDEX_ENTRY_PATH)).not.toContain("accent-tokens.generated.css");
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
    // schemes at (0,2,1) — level with the generated colourway blocks, above the
    // authored Fun token blocks, and winning the tie on source order because
    // this sheet is imported last. It does not out-rank the Theme Lab's runtime
    // overrides, and must not: those reach (0,4,1) and land in <head> after this
    // sheet, because an editor authoring in the Lab has to be able to see a Pro
    // edit take effect. The cascade ladder suite below pins all of it.
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

  it("paints accent through colour-valued tokens, never an hsl() component list", () => {
    // The retired shadcn bridge declared --primary/--accent/--ring as bare
    // `H S% L%` component lists — in base.css for Fun, restated here for Pro —
    // and painted prose links, the accent CTA's label and focus rings through
    // hsl(var(--…)). A component list is not a colour value, so it cannot read
    // a colour-valued seed: Pro had to restate all five by hand in both
    // schemes, and no colourway could move them at all. The same defect made
    // the --dose-fuchsia-* / --dose-violet-* scale unreachable. The shape is
    // forbidden rather than merely unused, because reintroducing it would
    // reintroduce accent paint that the accent axis cannot reach.
    const styleDir = path.join(REPO_ROOT, "src", "styles");
    const bridged = /hsl\(\s*var\(\s*--(primary|accent|ring|dose-)/;

    for (const sheet of fs.readdirSync(styleDir).filter((name) => name.endsWith(".css"))) {
      expect(read(path.join(styleDir, sheet))).not.toMatch(bridged);
    }

    for (const sheet of [skin, read(path.join(styleDir, "base.css"))]) {
      const bare = declaredProperties(stripComments(sheet)).filter((name) =>
        /^--(primary|accent|ring|dose-)/.test(name),
      );
      expect(bare).toEqual([]);
    }
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

/**
 * The cascade rank ladder, asserted as arithmetic.
 *
 * Five rungs, higher wins: the authored Fun palette in site-colors.css, the
 * generated colourway blocks, the Pro palette, the generated accent blocks, and
 * the Theme Lab's runtime user layer on top. Each rung exists so a reader's
 * later choice can re-tint an earlier one, so the ORDER is the contract — not
 * any particular selector text. Hence computed specificity here: a rewrite that
 * keeps every string parsing but swaps two rungs has to fail.
 *
 * Rung 4 is now a file rather than a fixture: `accent-tokens.generated.css`
 * ships, and the selectors measured here are read out of it. Both of its shapes
 * are checked, because they are not the same rank — a Pro accent block names
 * three attributes (0,3,1) so it out-ranks the Pro palette it re-seeds on
 * specificity, while a Fun accent block names two (0,2,1) and out-ranks a
 * colourway only on source order, which is why the sheet is imported last.
 *
 * Rung 5 is no longer latent. The Palette Lab's Fun force-lock is gone, so an
 * editor wears Pro on `/dev/themes` and edits its `--ei-*` accent seeds there;
 * the rank measured here is what makes those edits visible instead of inert. What
 * guarantees the win is specificity alone: `userLayerSelector()` names
 * `data-theme` four times for (0,4,1), one rung above the (0,3,1) Pro accent
 * block read out of the sheet below. So it does not matter where the bundler
 * drops the generated CSS, and no route has to pin a visual style to keep the
 * Lab's edits honest — which is why the pin could be removed at all.
 */
describe("cascade rank ladder", () => {
  const CHROME_DARK = ".theme-chrome-dark";

  const colourwaySelectors = selectorsOf(read(PRESET_CSS_PATH));
  const rootColourways = colourwaySelectors.filter((part) => !part.includes(CHROME_DARK));
  const islandColourways = colourwaySelectors.filter((part) => part.includes(CHROME_DARK));

  const accentSelectors = selectorsOf(read(ACCENT_CSS_PATH));
  // Split on the POSITIVE Pro scope. A Fun block names the same attribute inside a
  // :where(:not(…)) guard, so `includes` would sort every Fun selector as a Pro one.
  const proAccents = accentSelectors.filter((part) => part.startsWith(`html${STYLE_SCOPE}`));
  const funAccents = accentSelectors.filter(
    (part) => !part.startsWith(`html${STYLE_SCOPE}`) && !part.includes(CHROME_DARK),
  );
  /** Rung 4, measured out of the shipped sheet rather than asserted as a string. */
  const PRO_ACCENT_BLOCK = proAccents[0];

  it("reads the selector forms the theme sheets actually use", () => {
    // The calculator is load-bearing for every assertion below, and two of the
    // forms it has to get right are unusual: a zero-specificity :where() guard,
    // and an attribute named more than once.
    expect(specificityOf(":root")).toEqual([0, 1, 0]);
    expect(specificityOf('html[data-theme="light"]')).toEqual([0, 1, 1]);
    expect(
      specificityOf(`html[data-theme="light"]:where(:not(${STYLE_SCOPE})) ${CHROME_DARK}`),
    ).toEqual([0, 2, 1]);
    expect(specificityOf(`html:not(#a, ${CHROME_DARK})`)).toEqual([1, 0, 1]);
    expect(specificityOf('html[data-theme="dark"][data-theme]')).toEqual([0, 2, 1]);
  });

  it("keeps the authored Fun palette below the generated colourways", () => {
    const authored = selectorsOf(read(SITE_COLORS_PATH));
    const funRoot = ":root";
    const funLight = 'html[data-theme="light"]';
    const funIsland = `html[data-theme="light"]:where(:not(${STYLE_SCOPE})) ${CHROME_DARK}`;

    // Fixtures tied back to the sheet, so a renamed selector fails here rather
    // than silently measuring a string no stylesheet contains.
    for (const selector of [funRoot, funLight, funIsland]) {
      expect(authored).toContain(selector);
    }

    expect(rootColourways.length).toBeGreaterThan(0);
    expect(islandColourways.length).toBeGreaterThan(0);
    for (const selector of rootColourways) expect(specificityOf(selector)).toEqual([0, 2, 1]);
    for (const selector of islandColourways) expect(specificityOf(selector)).toEqual([0, 3, 1]);

    // Like for like: the root blocks out-rank the authored root blocks, and the
    // colourway's dark-chrome island out-ranks the authored one.
    for (const base of [funRoot, funLight]) {
      expect(compareSpecificity(specificityOf(rootColourways[0]), specificityOf(base))).toBeGreaterThan(0);
    }
    expect(
      compareSpecificity(specificityOf(islandColourways[0]), specificityOf(funIsland)),
    ).toBeGreaterThan(0);
  });

  it("ties the Pro palette with the colourways and lets import order break it", () => {
    for (const scheme of [LIGHT_SCHEME_SCOPE, DARK_SCHEME_SCOPE]) {
      expect(specificityOf(`html${scheme}`)).toEqual([0, 2, 1]);
      expect(compareSpecificity(specificityOf(`html${scheme}`), specificityOf(rootColourways[0]))).toBe(0);
    }

    // A tie is decided by source order, so the tie is only safe while Pro is
    // imported after the colourways. Both sheets are unlayered.
    const imports = [...read(DOSEWIKI_ENTRY_PATH).matchAll(/import\s+"([^"]+)";/g)].map(
      (match) => match[1],
    );

    expect(imports.indexOf("../../styles/pro-theme.css")).toBeGreaterThan(
      imports.indexOf("../../styles/palette-presets.generated.css"),
    );
    expect(imports.indexOf("../../styles/palette-presets.generated.css")).toBeGreaterThan(-1);
  });

  it("puts the Theme Lab's user layer above a generated accent block", () => {
    // Both shapes come out of the shipped sheet, so a regenerated selector that
    // changed rank fails here rather than passing against a stale string.
    expect(proAccents.length).toBeGreaterThan(0);
    expect(funAccents.length).toBeGreaterThan(0);
    for (const selector of proAccents) expect(specificityOf(selector)).toEqual([0, 3, 1]);
    // A Fun accent block ties the colourways and the Pro palette at (0,2,1) and
    // wins on source order. Its Pro guard is a :where(:not(…)), which contributes
    // nothing, so carrying it cannot move the rung.
    for (const selector of funAccents) {
      expect(selector).toContain(`:where(:not(${STYLE_SCOPE}))`);
      expect(specificityOf(selector)).toEqual([0, 2, 1]);
      expect(compareSpecificity(specificityOf(selector), specificityOf(rootColourways[0]))).toBe(0);
    }
    // The dark layer is a two-selector list: the root, and the dark-chrome
    // subtree island that keeps a dark header dark on a light page.
    const [darkRoot, darkIsland] = splitSelectorList(userLayerSelector("dark")).map((part) =>
      part.trim(),
    );

    expect(specificityOf(darkRoot)).toEqual([0, 4, 1]);
    expect(specificityOf(darkIsland)).toEqual([0, 5, 1]);
    expect(specificityOf(userLayerSelector("light"))).toEqual([0, 4, 1]);

    // Strictly above rung 4, not level with it: a tie would leave the reader's
    // own edits winning only because this element is appended to <head> after
    // the bundled sheets, and the accent sheet's position in that order is the
    // bundler's business, not the Lab's.
    for (const layer of [darkRoot, darkIsland, userLayerSelector("light")]) {
      expect(compareSpecificity(specificityOf(layer), specificityOf(PRO_ACCENT_BLOCK))).toBeGreaterThan(0);
    }

    // And still above every rung below 4, which is what a Fun edit relies on.
    for (const lower of [rootColourways[0], islandColourways[0], `html${DARK_SCHEME_SCOPE}`]) {
      expect(compareSpecificity(specificityOf(darkRoot), specificityOf(lower))).toBeGreaterThan(0);
    }
  });
});
