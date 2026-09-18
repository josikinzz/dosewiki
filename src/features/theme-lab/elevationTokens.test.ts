import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { __unstable__loadDesignSystem } from "tailwindcss";
import { PALETTE_GROUPS } from "./paletteTokens";
import { readSourceFiles } from "@/test/sourceScan";

/**
 * Elevation tokens are the shadow half of the theme's flatness axis: every
 * shadow a component asks for is a `--theme-elevation-*` value rather than a
 * hardcoded Tailwind utility, so depth becomes a token flip instead of a
 * codemod. These tests pin the three-way agreement that makes that true —
 * stylesheet defines it, registry exposes it, call sites consume it.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SITE_COLORS = fs.readFileSync(path.join(REPO_ROOT, "src/styles/site-colors.css"), "utf8");
const PRO_THEME = fs.readFileSync(path.join(REPO_ROOT, "src/styles/pro-theme.css"), "utf8");

const ELEVATION_PREFIX = "--theme-elevation-";

/** This file quotes shadow utilities as examples, and it scans itself. */
const GUARD_FILE = "src/features/theme-lab/elevationTokens.test.ts";

function isExempt(relativePath: string) {
  return relativePath === GUARD_FILE;
}

const shadowDesignSystem = await __unstable__loadDesignSystem(
  fs.readFileSync(new URL(import.meta.resolve("tailwindcss/theme.css")), "utf8"),
);

/**
 * Every spelling of a hardcoded shadow, not just the named scale. The three
 * forms this migration replaced — the Tailwind scale ("shadow-" + "lg"), a
 * shadow-colour utility ("shadow-" + "fuchsia-500/8") and an arbitrary value
 * ("shadow-" + "[0_10px_15px_-3px_…]") — all have to stay gone; only
 * "shadow-" + "[var(--theme-…)]" is allowed through. The example spellings
 * here are deliberately split: this file sits inside Tailwind's content glob,
 * and a contiguous spelling would compile junk rules into the CSS bundle.
 *
 * The lookbehind rejects a preceding `-` or word character, which is what
 * keeps `drop-shadow-`, `text-shadow-`, `--tw-shadow-color` and
 * `--theme-shadow-soft` out of the results; Tailwind variant prefixes end in
 * `:` and pass. `shadow-none` passes too: it removes elevation rather than
 * hardcoding one, which is how a token-driven surface opts out.
 */
function hardcodedShadows(text: string) {
  const candidates = text.match(/(?<![-\w])shadow-(?!\[var\(--theme-)[^\s"'`]*/g) ?? [];
  const compiled = shadowDesignSystem.candidatesToCss(candidates);
  return candidates.filter((candidate, index) => compiled[index] !== null && candidate !== "shadow-none");
}

const SOURCE_FILES = readSourceFiles(["src/app", "src/components", "src/features", "src/hooks"], {
  includeTests: true,
}).map(({ path: relativePath, text }) => ({ relativePath, text }));

const registeredElevationIds = PALETTE_GROUPS.flatMap((group) => group.tokens)
  .map((token) => token.id)
  .filter((id) => id.startsWith(ELEVATION_PREFIX));

function definedIn(css: string) {
  return new Set(Array.from(css.matchAll(/(--theme-elevation-[\w-]+)\s*:/g), (m) => m[1]));
}

describe("elevation tokens", () => {
  it("distinguishes compiled shadow utilities from non-utility domain identifiers", () => {
    const prefix = "shadow-";
    expect(hardcodedShadows(`${prefix}people ${prefix}lg ${prefix}fuchsia-500/8 ${prefix}[0_2px_4px_black] ${prefix}[var(--theme-elevation-card)]`))
      .toEqual([`${prefix}lg`, `${prefix}fuchsia-500/8`, `${prefix}[0_2px_4px_black]`]);
  });

  it("registers every elevation token the stylesheet defines, and vice versa", () => {
    const defined = definedIn(SITE_COLORS);

    expect(defined.size).toBeGreaterThan(0);
    expect([...registeredElevationIds].sort()).toEqual([...defined].sort());
  });

  it("exposes them as raw values, since a box-shadow is not a single color", () => {
    const elevationTokens = PALETTE_GROUPS.flatMap((group) => group.tokens).filter((token) =>
      token.id.startsWith(ELEVATION_PREFIX),
    );

    for (const token of elevationTokens) {
      expect(token.kind, `${token.id} should be raw-editable`).toBe("raw");
    }
  });

  it("resolves every elevation token a call site asks for", () => {
    const defined = definedIn(SITE_COLORS);
    const referenced = new Map<string, string>();

    for (const { relativePath, text } of SOURCE_FILES) {
      for (const match of text.matchAll(/var\((--theme-elevation-[\w-]+)\)/g)) {
        referenced.set(match[1], relativePath);
      }
    }

    expect(referenced.size).toBeGreaterThan(0);
    for (const [tokenId, relativePath] of referenced) {
      expect(defined.has(tokenId), `${relativePath} reads undefined ${tokenId}`).toBe(true);
    }
  });

  it("policy: no hardcoded shadow utility in src/app, src/components, src/features, src/hooks (only theme elevation token shadows)", () => {
    const offenders = SOURCE_FILES.filter(({ relativePath }) => !isExempt(relativePath))
      .map(({ relativePath, text }) => ({
        relativePath,
        matches: [...new Set(hardcodedShadows(text))],
      }))
      .filter(({ matches }) => matches.length > 0)
      .map(({ relativePath, matches }) => `${relativePath}: ${matches.join(", ")}`);

    expect(offenders).toEqual([]);
  });

  it("keeps the Pro skin's flattened shadows expressed as token values", () => {
    // The skin used to reach into `--tw-shadow-color` on three utility class
    // selectors. Those selectors no longer exist, so the overrides have to be
    // token-level or the Pro style regains the Fun style's brand glows.
    for (const tokenId of [
      "--theme-elevation-control-primary",
      "--theme-elevation-icon-tile",
      "--theme-elevation-mark-hairline",
    ]) {
      expect(definedIn(PRO_THEME).has(tokenId), `${tokenId} is unskinned`).toBe(true);
    }
  });
});
