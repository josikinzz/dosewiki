/**
 * Drift guard for the inline-edit allow-list.
 *
 * `server/lib/articleFieldWrites.ts` cannot import from `src/`, so its
 * templates are hand-written strings with no compiler holding them against the
 * schema. A single typo (`finding` for `findings`) would sail through review
 * and only surface as a runtime refusal on the one article somebody tried to
 * edit. This test resolves every template against the generated field registry.
 */
import { describe, expect, it } from "vitest";

import {
  EDITABLE_ARTICLE_FIELD_KINDS,
  type EditableFieldKind,
} from "../server/lib/articleFieldWrites";
import { FIELD_REGISTRY } from "@/data/schema/fieldRegistry";

const TEMPLATES = Object.entries(EDITABLE_ARTICLE_FIELD_KINDS) as Array<
  [string, EditableFieldKind]
>;

function matchesRegistryPath(template: string, registryPath: string): boolean {
  const templateSegments = template.split(".");
  const registrySegments = registryPath.split(".");
  if (templateSegments.length !== registrySegments.length) return false;
  return templateSegments.every(
    (segment, index) => segment === "*" || segment === registrySegments[index],
  );
}

function lookupRegistry(pathish: string): string | null {
  // The registry describes an array as its container (`legality.international`),
  // never as an element, so a template's trailing `[]` has no registry twin.
  for (const candidate of [pathish, pathish.replace(/\[\]$/, "")]) {
    if (FIELD_REGISTRY[candidate]) return candidate;
    if (candidate.includes("*")) {
      const match = Object.keys(FIELD_REGISTRY).find((registryPath) =>
        matchesRegistryPath(candidate, registryPath),
      );
      if (match) return match;
    }
  }
  return null;
}

/**
 * Templates whose leaf sits under a record or an array of objects have no
 * registry entry of their own, so those resolve to the nearest enclosing
 * registry path instead.
 */
function resolveTemplate(template: string): string | null {
  const segments = template.split(".");
  for (let length = segments.length; length > 0; length -= 1) {
    const match = lookupRegistry(segments.slice(0, length).join("."));
    if (match) return match;
  }
  return null;
}

describe("inline-edit allow-list vs. the field registry", () => {
  it("resolves every template into the registry", () => {
    const unresolved = TEMPLATES.filter(([template]) => resolveTemplate(template) === null);
    expect(unresolved.map(([template]) => template)).toEqual([]);
  });

  it("authorizes no status, level, or classification leaf", () => {
    // Those render as canonical badges derived from the stored value, so a
    // free-text edit of one could not survive its own round trip.
    const forbiddenLeaves = ["status", "level", "canonicalStatus", "system", "heading"];
    const offenders = TEMPLATES.map(([template]) => template).filter((template) =>
      forbiddenLeaves.includes(template.split(".").pop() ?? ""),
    );
    expect(offenders).toEqual([]);
  });
});
