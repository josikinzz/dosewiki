import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE_GROUPS } from "./paletteTokens";

/**
 * Elevation tokens are the shadow half of the theme's flatness axis: every
 * shadow a component asks for is a `--theme-elevation-*` value rather than a
 * hardcoded Tailwind utility, so depth becomes a token flip instead of a
 * codemod. These tests pin the three-way agreement that makes that true —
 * stylesheet defines it, registry exposes it, call sites consume it.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SITE_COLORS = fs.readFileSync(path.join(REPO_ROOT, "src/styles/site-colors.css"), "utf8");
const EFFECT_INDEX = fs.readFileSync(
  path.join(REPO_ROOT, "src/styles/effectindex-theme.css"),
  "utf8",
);

const ELEVATION_PREFIX = "--theme-elevation-";

/**
 * Two files still carry a bare Tailwind shadow utility. Both had unrelated
 * in-flight edits in the working tree when the call sites were migrated, so
 * they were deliberately left for whoever lands that work.
 */
const PENDING_CALL_SITES = new Set([
  "src/features/article/components/sections/DosageDurationSection.tsx",
  "src/features/dev/tools/review-mode/ReviewExperience.tsx",
]);

const SCAN_ROOTS = ["src/app", "src/components", "src/features", "src/hooks"];

function collectSourceFiles(root: string): string[] {
  const absolute = path.join(REPO_ROOT, root);
  if (!fs.existsSync(absolute)) return [];

  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(child);
    return /\.tsx?$/.test(entry.name) ? [child] : [];
  });
}

const SOURCE_FILES = SCAN_ROOTS.flatMap(collectSourceFiles).map((relativePath) => ({
  relativePath,
  text: fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"),
}));

const registeredElevationIds = PALETTE_GROUPS.flatMap((group) => group.tokens)
  .map((token) => token.id)
  .filter((id) => id.startsWith(ELEVATION_PREFIX));

function definedIn(css: string) {
  return new Set(Array.from(css.matchAll(/(--theme-elevation-[\w-]+)\s*:/g), (m) => m[1]));
}

describe("elevation tokens", () => {
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

  it("leaves no hardcoded Tailwind shadow scale in component call sites", () => {
    const hardcoded = /(?<![-\w])(?:[\w[\]=.@():-]+:)*shadow-(?:2xl|xl|lg|md|sm|inner|none)(?![-\w[])/;
    const offenders = SOURCE_FILES.filter(
      ({ relativePath, text }) =>
        !PENDING_CALL_SITES.has(relativePath) && hardcoded.test(text),
    ).map(({ relativePath }) => relativePath);

    expect(offenders).toEqual([]);
  });

  it("keeps the Effect Index skin's flattened shadows expressed as token values", () => {
    // The skin used to reach into `--tw-shadow-color` on three utility class
    // selectors. Those selectors no longer exist, so the overrides have to be
    // token-level or the sibling site regains dosewiki's brand glows.
    for (const tokenId of [
      "--theme-elevation-control-primary",
      "--theme-elevation-icon-tile",
      "--theme-elevation-mark-hairline",
    ]) {
      expect(definedIn(EFFECT_INDEX).has(tokenId), `${tokenId} is unskinned`).toBe(true);
    }
  });
});
