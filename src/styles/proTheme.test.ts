import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { userLayerSelector } from "@/features/theme-lab/themeLabStorage";
import { buildAccentStylesheetCss } from "@/theme/accentStylesheet";
import { buildSurfaceStylesheetCss } from "@/theme/surfaceStylesheet";

/**
 * Structural guards for the Pro visual style. The properties asserted here are
 * the ones that fail silently rather than loudly: a rule that forgets the style
 * scope leaks Pro onto Fun, a rule that keeps the publication scope leaves Pro
 * unreachable on dose.wiki, an escaped attribute selector matches nothing at
 * all, a seed that only one scheme defines leaves the other scheme resolving
 * nothing, and an <image>-typed token flattened to a bare colour is dropped by
 * the CSS parser with no error anywhere. Typography values and entry import
 * lists are deliberately not pinned here: appearanceSheets.test.ts owns the
 * late-link order, and sizes are design, not structure.
 *
 * Paths are resolved from the repo root rather than from an env var so the
 * suite reads the same files the build does, on either flavor.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SKIN_PATH = path.join(REPO_ROOT, "src", "styles", "pro-theme.css");
const DOSEWIKI_ENTRY_PATH = path.join(REPO_ROOT, "src", "app", "_styles", "dosewiki.ts");
const SITE_COLORS_PATH = path.join(REPO_ROOT, "src", "styles", "site-colors.css");

const STYLE_SCOPE = '[data-visual-style="pro"]';
const LIGHT_SCHEME_SCOPE = `${STYLE_SCOPE}[data-theme="light"]`;
const DARK_SCHEME_SCOPE = `${STYLE_SCOPE}[data-theme="dark"]`;

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

describe("pro visual style", () => {
  const skin = read(SKIN_PATH);
  const blocks = blocksOf(skin);

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
    // one scheme rots when a second one arrives. These exemptions are
    // scheme-independent by nature: the chrome rails and their portalled
    // Appearance panel are charcoal in BOTH schemes, and the lightbox is a
    // darkened room in both.
    const exempt = [
      LIGHT_SCHEME_SCOPE,
      DARK_SCHEME_SCOPE,
      ".app-header",
      ".app-footer",
      ".theme-appearance-popover",
      ".yarl__root",
    ];
    const offenders = blocks
      .filter((block) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(|hsl\(/.test(block.body))
      .map((block) => block.selector)
      .filter((selector) => !exempt.some((allowed) => selector.includes(allowed)));

    expect(offenders).toEqual([]);
  });

  it("reaches the accent through the on-dark seed alone inside the rails", () => {
    // The defect this closes: .app-header and .app-footer carry no data-theme,
    // so a declaration inside them resolves whichever half of the palette the
    // PAGE is in. These four accent seeds hold a different value per half, so
    // a rail that reads one paints the page-scheme accent onto a charcoal bar
    // — --ei-accent-muted is #34837c over paper, 3.03:1 on the header, which
    // is how the muted step got hard-coded to a literal in the first place.
    // --ei-accent-on-dark is the one accent seed that means "as it appears on
    // a dark bar" and carries one value in both halves, so it is the only one
    // a rail may resolve; a rail that wants a step off it mixes, as the muted
    // step does.
    //
    // The chrome, ink and wash seeds are deliberately NOT on this list. The
    // rails do shift with the scheme — #2e2e2e over paper, #1f1f1f over a dark
    // canvas — and that bracketing is the design. Only the accent must hold.
    const schemeDependentAccents: Record<string, true> = {
      "--ei-accent": true,
      "--ei-accent-strong": true,
      "--ei-accent-soft": true,
      "--ei-accent-muted": true,
    };

    // Guard the guard: a renamed seed has to break this test, not empty it.
    const seeded = new Set(
      blocks
        .filter((block) => block.selector.includes(LIGHT_SCHEME_SCOPE))
        .flatMap((block) => declaredProperties(block.body)),
    );
    expect(Object.keys(schemeDependentAccents).filter((name) => !seeded.has(name))).toEqual([]);

    const railBlocks = blocks.filter((block) => /\.app-(header|footer)\b/.test(block.selector));
    const offenders = railBlocks.flatMap((block) =>
      [...block.body.matchAll(/var\(\s*(--ei-[a-z0-9-]+)/g)]
        .map((match) => match[1])
        .filter((name) => name in schemeDependentAccents)
        .map((name) => `${block.selector} reads ${name}`),
    );

    expect(offenders).toEqual([]);
    // Non-vacuous: the rails really do paint accent, through the on-dark seed.
    const onDarkReads = railBlocks.flatMap((block) => [
      ...block.body.matchAll(/var\(\s*--ei-accent-on-dark\b/g),
    ]);
    expect(onDarkReads.length).toBeGreaterThanOrEqual(8);
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

  it("keeps the style's standard body face available while Dyslexic-friendly is active", () => {
    // Effect Index ships Titillium as --font-display and defines no --font-pro;
    // dose.wiki registers it lazily as --font-pro and keeps Blinker on
    // --font-display. The fallback is what lets one declaration serve both.
    expect(skin).toContain(
      "--font-family-standard-body: var(--font-pro, var(--font-display))",
    );
    expect(skin).toContain("--font-family-body: var(--font-family-standard-body)");
    expect(skin).toContain("--font-family-display: var(--font-pro, var(--font-display))");

    // Collapsed whitespace: the contract is the fallback chain, not the formatter's wrap.
    const base = read(path.join(REPO_ROOT, "src", "styles", "base.css")).replace(/\s+/g, " ");
    expect(base).toContain("--font-family-standard-body: var(--font-body, Inter), Inter");
    expect(base).toContain("--font-family-body: var(--font-family-standard-body)");
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
});

/**
 * The cascade rank ladder, asserted as arithmetic.
 *
 * Five rungs, higher wins: the authored Fun palette in site-colors.css, the
 * generated surface blocks, the Pro palette, the generated accent blocks, and
 * the Theme Lab's runtime user layer on top. Each rung exists so a reader's
 * later choice can re-tint an earlier one, so the ORDER is the contract — not
 * any particular selector text. Hence computed specificity here: a rewrite that
 * keeps every string parsing but swaps two rungs has to fail.
 *
 * Rungs 2 and 4 are the generated sheets, measured off the builders (`accents.axis.test.ts` /
 * `surfaces.axis.test.ts` pin the checked-in files to the same builders). Each sheet has ONE
 * shape now that the named colourways are retired: the surface sheet's base Fun block names
 * two attributes through a bare `:not()` for (0,2,1), and the accent sheet's base Pro block
 * names three for (0,3,1), so it out-ranks the Pro palette it re-seeds on specificity alone.
 *
 * That (0,2,1) tie is the one place the ladder's reasoning is not "later wins", and it is
 * worth stating because the import order looks like it decides and does not. Both generated
 * sheets load AFTER pro-theme.css, so at (0,2,1) the Fun block would take the tie and repaint
 * a Pro page. It therefore carries `:where(:not([data-visual-style="pro"]))`, which cannot
 * match a Pro root at all and contributes nothing to specificity: it separates the rungs
 * without moving either.
 *
 * Rung 5 is no longer latent. The Theme Lab's Fun force-lock is gone, so an
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

  const funSurfaces = selectorsOf(buildSurfaceStylesheetCss());
  const proAccents = selectorsOf(buildAccentStylesheetCss());
  /** Rung 4, measured out of the builder rather than asserted as a string. */
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

  it("keeps the authored Fun palette below the generated surface blocks", () => {
    const authored = selectorsOf(read(SITE_COLORS_PATH));
    const funRoot = ":root";
    const funLight = 'html[data-theme="light"]';
    const funIsland = `html[data-theme="light"]:where(:not(${STYLE_SCOPE})) ${CHROME_DARK}`;

    // Fixtures tied back to the sheet, so a renamed selector fails here rather
    // than silently measuring a string no stylesheet contains.
    for (const selector of [funRoot, funLight, funIsland]) {
      expect(authored).toContain(selector);
    }

    expect(funSurfaces.length).toBeGreaterThan(0);
    for (const selector of funSurfaces) expect(specificityOf(selector)).toEqual([0, 2, 1]);

    // The one shape has to clear the authored blocks, and it is the shape that could quietly
    // stop doing so: it is keyed on the retired attribute's ABSENCE, and the `:not()` is bare
    // so that it keeps (0,2,1). Wrapped in `:where()` it would drop to (0,1,1), below the
    // authored light block it has to re-seat, and a reader would see the authored palette
    // instead of the base surface's own. The named colourways are retired, so a value selector
    // reappearing means a colourway block came back without its axis.
    for (const selector of funSurfaces) expect(selector).toContain(":not([data-surface])");
    expect(funSurfaces.filter((part) => part.includes('[data-surface="'))).toEqual([]);

    for (const selector of funSurfaces) {
      for (const lower of [funRoot, funLight]) {
        expect(compareSpecificity(specificityOf(selector), specificityOf(lower))).toBeGreaterThan(0);
      }
    }
  });

  it("ties the Pro palette with a Fun surface block and separates them with the Pro guard", () => {
    for (const scheme of [LIGHT_SCHEME_SCOPE, DARK_SCHEME_SCOPE]) {
      expect(specificityOf(`html${scheme}`)).toEqual([0, 2, 1]);
      expect(compareSpecificity(specificityOf(`html${scheme}`), specificityOf(funSurfaces[0]))).toBe(0);
    }

    // The tie is now order-independent in BOTH directions. In the bundle the surface sheet
    // loaded after Pro, so a Fun block would have won on source order; today Pro attaches as
    // a late <link> after the whole bundle, so the tie would fall the other way — but the
    // guard, not the order, is what a Pro page's palette rests on, and it must keep holding
    // from wherever a future mechanism drops either sheet. Both halves stay pinned: Pro is
    // out of the bundle entirely, and every Fun block is unmatchable under Pro.
    const imports = [...read(DOSEWIKI_ENTRY_PATH).matchAll(/import\s+"([^"]+)";/g)].map(
      (match) => match[1],
    );

    expect(imports).toContain("../../styles/surface-tokens.generated.css");
    expect(imports).not.toContain("../../styles/pro-theme.css");

    for (const selector of funSurfaces) {
      expect(selector).toContain(`:where(:not(${STYLE_SCOPE}))`);
    }
  });

  it("puts the Theme Lab's user layer above a generated accent block", () => {
    // Every shape comes out of the builder the checked-in sheet is pinned to, so a regenerated
    // selector that changed rank fails here rather than passing against a stale string. The
    // accent sheet is Pro-only now: one base block-pair at (0,3,1), keyed on the retired
    // attribute's absence through a bare :not(), which is what beats the Pro palette it
    // re-seeds from wherever the bundler drops it.
    expect(proAccents.length).toBe(2);
    for (const selector of proAccents) {
      expect(specificityOf(selector)).toEqual([0, 3, 1]);
      expect(selector).toContain(":not([data-accent])");
    }
    expect(proAccents.filter((part) => part.includes('[data-accent="'))).toEqual([]);
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
    for (const lower of [funSurfaces[0], `html${DARK_SCHEME_SCOPE}`]) {
      expect(compareSpecificity(specificityOf(darkRoot), specificityOf(lower))).toBeGreaterThan(0);
    }
  });
});
