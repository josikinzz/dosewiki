/**
 * Drift guard for the inline-edit allow-list.
 *
 * `server/lib/articleFieldWrites.ts` cannot import from `src/`, so its
 * templates are hand-written strings with no compiler holding them against the
 * schema. A single typo — `finding` for `findings` — would sail through review
 * and only surface as a runtime refusal on the one article somebody tried to
 * edit. This test resolves every template against the generated field registry
 * and the schema's own types instead.
 */
import { describe, expect, it } from "vitest";

import {
  EDITABLE_ARTICLE_FIELD_KINDS,
  type EditableFieldKind,
} from "../server/lib/articleFieldWrites";
import { FIELD_REGISTRY } from "@/data/schema/fieldRegistry";
import { isFieldPathDiagnostic, parseFieldPath } from "@/data/schema/fieldPath";
import type { FieldType } from "@/data/schema/types";
import type {
  CountryLegality,
  EffectSubcategory,
  HistoryCultureSection,
  HistoryCultureSubsection,
  OrganToxicityEntry,
  SenseCategory,
  SubjectiveEffectsNotes,
} from "@/schema";

const TEMPLATES = Object.entries(EDITABLE_ARTICLE_FIELD_KINDS) as Array<
  [string, EditableFieldKind]
>;

/** Registry types that legitimately back each editable kind. */
const REGISTRY_TYPES_BY_KIND: Record<EditableFieldKind, ReadonlySet<FieldType>> = {
  text: new Set<FieldType>(["text", "textarea"]),
  range: new Set<FieldType>(["dose", "duration"]),
};

type ResolutionMode =
  /** The template names a registry path outright. */
  | "exact"
  /** A `*` stands in for one of several schema-declared keys the registry lists. */
  | "wildcard"
  /** The template addresses one element of a registry-declared string array. */
  | "element"
  /** The registry stops at an enclosing container; the leaf is data-shaped. */
  | "container";

interface Resolution {
  mode: ResolutionMode;
  registryPath: string;
  type: FieldType;
}

/** Registry types whose *elements* are plain strings. */
const STRING_ARRAY_TYPES = new Set<FieldType>(["tagArray", "array"]);

function matchesRegistryPath(template: string, registryPath: string): boolean {
  const templateSegments = template.split(".");
  const registrySegments = registryPath.split(".");
  if (templateSegments.length !== registrySegments.length) return false;
  return templateSegments.every(
    (segment, index) => segment === "*" || segment === registrySegments[index],
  );
}

/**
 * Where a template lands in the registry.
 *
 * The registry enumerates schema keys, so most templates match a path outright
 * (or, once a `*` stands in for one of the six schema-declared senses, match a
 * family of them). Templates whose leaf sits under a record or an array of
 * objects have no registry entry of their own — the registry stops at the
 * container — so those resolve to the nearest enclosing registry path instead.
 */
function lookupRegistry(pathish: string): { registryPath: string; type: FieldType } | null {
  // The registry describes an array as its container (`legality.international`),
  // never as an element, so a template's trailing `[]` has no registry twin.
  for (const candidate of [pathish, pathish.replace(/\[\]$/, "")]) {
    const meta = FIELD_REGISTRY[candidate];
    if (meta) return { registryPath: candidate, type: meta.type };
    if (candidate.includes("*")) {
      const match = Object.keys(FIELD_REGISTRY).find((registryPath) =>
        matchesRegistryPath(candidate, registryPath),
      );
      if (match) return { registryPath: match, type: FIELD_REGISTRY[match].type };
    }
  }
  return null;
}

function resolveTemplate(template: string): Resolution | null {
  const leaf = lookupRegistry(template);
  if (leaf) {
    const mode: ResolutionMode = template.endsWith("[]")
      ? "element"
      : template.includes("*") && !FIELD_REGISTRY[template]
        ? "wildcard"
        : "exact";
    return { mode, ...leaf };
  }

  const segments = template.split(".");
  for (let length = segments.length - 1; length > 0; length -= 1) {
    const ancestor = lookupRegistry(segments.slice(0, length).join("."));
    if (ancestor) return { mode: "container", ...ancestor };
  }

  return null;
}

describe("inline-edit allow-list vs. the field registry", () => {
  it("keeps every template well-formed under the field-path contract", () => {
    for (const [template] of TEMPLATES) {
      // `*` is inline-edit notation, not field-path notation; a concrete
      // instance is what actually travels to the API route and Postgres.
      const concrete = template
        .split(".")
        .map((segment) => (segment === "*" ? "sample_key" : segment.replace("[]", "[0]")))
        .join(".");
      const parsed = parseFieldPath(concrete);
      expect(isFieldPathDiagnostic(parsed), `${template} → ${concrete}`).toBe(false);
    }
  });

  it("resolves every template into the registry", () => {
    const unresolved = TEMPLATES.filter(([template]) => resolveTemplate(template) === null);
    expect(unresolved.map(([template]) => template)).toEqual([]);
  });

  it("declares a kind the registry type agrees with", () => {
    const mismatched: string[] = [];
    for (const [template, kind] of TEMPLATES) {
      const resolution = resolveTemplate(template);
      // A container resolution says nothing about the leaf's type — the
      // registry stops at `legality.countries` and never describes `.notes` —
      // so only direct and wildcard matches can be checked this way. The leaf
      // names themselves are pinned by the type assertions below.
      if (!resolution || resolution.mode === "container") continue;
      const allowed =
        resolution.mode === "element"
          ? kind === "text" && STRING_ARRAY_TYPES.has(resolution.type)
          : REGISTRY_TYPES_BY_KIND[kind].has(resolution.type);
      if (!allowed) {
        mismatched.push(
          `${template}: declared ${kind}, registry ${resolution.type} (${resolution.mode})`,
        );
      }
    }
    expect(mismatched).toEqual([]);
  });

  it("pins the leaf names of every container-resolved template", () => {
    // Compile-time assertions: `npm run typecheck` fails if a leaf is renamed
    // or misspelled, which is the failure the registry cannot see.
    const countryLeaves: Array<keyof CountryLegality> = ["notes"];
    const organToxicityLeaves: Array<keyof OrganToxicityEntry> = [
      "findings",
      "mechanism",
      "notes",
    ];
    const historySectionLeaves: Array<keyof HistoryCultureSection> = ["content"];
    const historySubsectionLeaves: Array<keyof HistoryCultureSubsection> = ["content"];
    const effectSubcategoryLeaves: Array<keyof EffectSubcategory> = ["note"];
    const senseLeaves: Array<keyof SenseCategory> = ["note", "subcategories"];
    const noteLeaves: Array<keyof SubjectiveEffectsNotes> = [
      "overview",
      "physical",
      "cognitive",
    ];

    const declaredLeaves = new Set(
      TEMPLATES.map(([template]) => template.split(".").pop()),
    );
    for (const leaf of [
      ...countryLeaves,
      ...organToxicityLeaves,
      ...historySectionLeaves,
      ...historySubsectionLeaves,
      ...effectSubcategoryLeaves,
      ...noteLeaves,
    ]) {
      expect(declaredLeaves.has(leaf)).toBe(true);
    }
    expect(senseLeaves).toContain("note");
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
