import { describe, expect, it } from "vitest";

import {
  EFFECT_NAME_ALIAS_COUNT,
  effectNameAliasTables,
  resolveEffectNameAlias,
} from "./effectNameAliases";
import { getEffectCategoryDefinition } from "./effectCategoryDefinitions";
import { slugify } from "@/utils/slug";

const { global: globalAliases, locationScoped, unlinked } = effectNameAliasTables;

const allAliasEntries = [
  ...Object.entries(globalAliases),
  ...Object.values(locationScoped).flatMap((map) => Object.entries(map)),
];

describe("effect name aliases", () => {
  it("keeps every source key in the slug shape the renderer derives", () => {
    // The table is keyed by `slugify(effect.name)`, so a key that is not already
    // slug-shaped can never be hit no matter how correct its destination is.
    const malformed = allAliasEntries
      .map(([source]) => source)
      .concat([...unlinked])
      .filter((source) => slugify(source) !== source);

    expect(malformed).toEqual([]);
  });

  it("never routes to a destination that is itself an alias source", () => {
    // A chained alias resolves to a stale target the moment the middle hop moves.
    const sources = new Set(allAliasEntries.map(([source]) => source));
    const chained = allAliasEntries
      .filter(([, target]) => !target.startsWith("category:") && sources.has(target))
      .map(([source, target]) => `${source} -> ${target}`);

    expect(chained).toEqual([]);
  });

  it("never both aliases and unlinks the same name", () => {
    const contradictory = allAliasEntries
      .map(([source]) => source)
      .filter((source) => unlinked.has(source));

    expect(contradictory).toEqual([]);
  });

  it("only routes to category pages that exist", () => {
    const categoryTargets = allAliasEntries
      .map(([, target]) => target)
      .filter((target) => target.startsWith("category:"))
      .map((target) => target.slice("category:".length));

    expect(categoryTargets.length).toBeGreaterThan(0);
    for (const slug of categoryTargets) {
      expect(getEffectCategoryDefinition(slug), `unknown category ${slug}`).toBeTruthy();
    }
  });

  it("resolves the location-dependent names by position", () => {
    // "Euphoria" is the most common broken chip on the site (150 occurrences) and
    // is only resolvable from where it sits: the index has no bare euphoria page.
    expect(resolveEffectNameAlias("euphoria", "cognitive")).toBe("/effects/cognitive-euphoria");
    expect(resolveEffectNameAlias("euphoria", "physical")).toBe("/effects/physical-euphoria");

    // Ingested PsychonautWiki subsection headings under the auditory sense.
    expect(resolveEffectNameAlias("enhancements", "sensory.auditory")).toBe(
      "/effects/auditory-enhancement",
    );
    expect(resolveEffectNameAlias("distortions", "sensory.auditory")).toBe(
      "/effects/auditory-distortion",
    );
    expect(resolveEffectNameAlias("hallucinations", "sensory.auditory")).toBe(
      "/effects/auditory-hallucination",
    );
  });

  it("sends genuine umbrella terms to a category index", () => {
    expect(resolveEffectNameAlias("dissociation")).toBe(
      "/effects/category/disconnective-effects",
    );
    expect(resolveEffectNameAlias("hallucinations", "cognitive")).toBe(
      "/effects/category/hallucinatory-states",
    );
  });

  it("returns null for names that are deliberately unlinked", () => {
    // Environmental Orbism was a real effect that the index removed, so there is
    // nothing to point at — and compound chips name two effects at once.
    expect(resolveEffectNameAlias("environmental-orbism")).toBeNull();
    expect(resolveEffectNameAlias("stimulation-and-sedation")).toBeNull();
    expect(resolveEffectNameAlias("hiccups")).toBeNull();
  });

  it("refuses to fall back for a location-scoped name in an unmapped location", () => {
    // Deriving `/effects/hallucinations` is exactly the 404 this table prevents.
    expect(resolveEffectNameAlias("hallucinations", "sensory.tactile")).toBeNull();
  });

  it("defers to the caller's own derivation for names it does not know", () => {
    expect(resolveEffectNameAlias("colour-enhancement", "sensory.visual")).toBeUndefined();
    expect(resolveEffectNameAlias("nausea", "physical")).toBeUndefined();
  });

  it("carries the whole adjudicated corpus, not a sample", () => {
    // Guards against a partial revert quietly shrinking the table back down.
    expect(EFFECT_NAME_ALIAS_COUNT).toBeGreaterThanOrEqual(125);
    expect(unlinked.size).toBeGreaterThanOrEqual(19);
  });
});
