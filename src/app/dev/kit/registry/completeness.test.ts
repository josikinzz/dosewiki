import { describe, expect, it } from "vitest";

import * as commonBarrel from "@/components/common";
import * as layoutBarrel from "@/components/layout";
import * as uiBarrel from "@/components/ui";

import { documentedExports, stories } from "./index";

/**
 * Drift protection for the UI Kit catalog (/dev/kit).
 *
 * Every runtime symbol exported from a shared barrel (`@/components/ui`,
 * `@/components/common`, `@/components/layout`) must be documented by exactly
 * one catalog story. Add a component (or a new export from an existing one)
 * without registering a story entry and this test fails the build — that is
 * what keeps the catalog from rotting.
 *
 * Type-only exports are naturally excluded: they don't exist at runtime, so
 * they never appear in Object.keys(barrel).
 */

/**
 * Runtime symbols that are intentionally NOT surfaced as their own catalog
 * entry. Keep this list small and justified — every addition is a hole in the
 * drift gate.
 */
const UNDOCUMENTED_ALLOWLIST = new Set<string>([]);

const SHARED_BARRELS = [
  { label: "ui/", barrel: uiBarrel as Record<string, unknown> },
  { label: "common/", barrel: commonBarrel as Record<string, unknown> },
  { label: "layout/", barrel: layoutBarrel as Record<string, unknown> },
];

function runtimeExports(barrel: Record<string, unknown>): string[] {
  return Object.keys(barrel)
    .filter((key) => !key.startsWith("__"))
    .filter((key) => !UNDOCUMENTED_ALLOWLIST.has(key))
    .sort();
}

describe("UI Kit catalog completeness", () => {
  for (const { label, barrel } of SHARED_BARRELS) {
    it(`documents every runtime export of the ${label} barrel`, () => {
      const documented = new Set(documentedExports());
      const undocumented = runtimeExports(barrel).filter((key) => !documented.has(key));

      expect(
        undocumented,
        `These ${label} barrel exports have no /dev/kit story. Add them to an ` +
          `existing story's \`exports\` array (and show them), or — if intentionally ` +
          `hidden — to UNDOCUMENTED_ALLOWLIST with a reason.\n  ${undocumented.join("\n  ")}`,
      ).toEqual([]);
    });
  }

  it("does not document a symbol that no shared barrel exports", () => {
    const runtime = new Set([
      ...Object.keys(uiBarrel),
      ...Object.keys(commonBarrel),
      ...Object.keys(layoutBarrel),
    ]);
    const stale = Array.from(new Set(stories.flatMap((story) => story.exports)))
      .filter((key) => !runtime.has(key))
      .sort();

    expect(
      stale,
      `These symbols are documented in a story but are not exported from any ` +
        `shared barrel (renamed or removed?):\n  ${stale.join("\n  ")}`,
    ).toEqual([]);
  });

  it("gives every story a unique id", () => {
    const ids = stories.map((story) => story.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
