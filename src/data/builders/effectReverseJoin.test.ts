import { describe, expect, it } from "vitest";

import { buildEffectData } from "./libraryBuilderTaxonomy";
import type { SubstanceRecord } from "./contentBuilder";

/**
 * The effect -> substances join has to agree with the substance -> effect link.
 * Before the alias table reached this builder, an article whose chip said
 * "Euphoria" linked to /effects/cognitive-euphoria but was absent from that
 * page's Related Substances list — 140 articles in the live data.
 */
function record(
  slug: string,
  entries: { name: string; slug: string | null }[],
): SubstanceRecord {
  return {
    slug,
    content: {
      subjectiveEffects: entries.map((entry) => entry.name),
      subjectiveEffectSlugs: entries.map((entry) => entry.slug),
    },
  } as unknown as SubstanceRecord;
}

describe("effect reverse join", () => {
  it("files a location-resolved name under the effect it links to", () => {
    const { effectMap } = buildEffectData([
      record("lsd", [{ name: "Euphoria", slug: "cognitive-euphoria" }]),
      record("mdma", [{ name: "Euphoria", slug: "cognitive-euphoria" }]),
      // Same display name, physical location, different effect page.
      record("codeine", [{ name: "Euphoria", slug: "physical-euphoria" }]),
    ]);

    expect(effectMap.get("cognitive-euphoria")?.records.size).toBe(2);
    expect(effectMap.get("physical-euphoria")?.records.size).toBe(1);
    // The unresolved name must not survive as its own bucket, or the association
    // is stranded on a slug no effect page is served at.
    expect(effectMap.has("euphoria")).toBe(false);
  });

  it("collapses drifted spellings onto one effect page", () => {
    const { effectMap } = buildEffectData([
      record("a", [{ name: "Empathy enhancement", slug: "empathy-affection-and-sociability-enhancement" }]),
      record("b", [{ name: "Sociability enhancement", slug: "empathy-affection-and-sociability-enhancement" }]),
      record("c", [
        {
          name: "Empathy, love and sociability enhancement",
          slug: "empathy-affection-and-sociability-enhancement",
        },
      ]),
    ]);

    expect(effectMap.get("empathy-affection-and-sociability-enhancement")?.records.size).toBe(3);
  });

  it("omits names that resolve to no single effect", () => {
    const { effectMap, effectSummaries } = buildEffectData([
      record("x", [
        // Removed from the index; nothing to be listed on.
        { name: "Environmental Orbism", slug: null },
        // Editor shorthand naming two effects at once.
        { name: "Stimulation and sedation", slug: null },
        { name: "Nausea", slug: "nausea" },
      ]),
    ]);

    expect(effectMap.has("environmental-orbism")).toBe(false);
    expect(effectMap.has("stimulation-and-sedation")).toBe(false);
    expect(effectSummaries.map((summary) => summary.slug)).toEqual(["nausea"]);
  });

  it("falls back to the derived slug when no resolution is supplied", () => {
    // Guards older/partial records: absent `subjectiveEffectSlugs` must behave
    // exactly as before rather than dropping every effect.
    const legacy = {
      slug: "legacy",
      content: { subjectiveEffects: ["Nausea", "Drifting"] },
    } as unknown as SubstanceRecord;

    const { effectMap } = buildEffectData([legacy]);

    expect(effectMap.get("nausea")?.records.size).toBe(1);
    expect(effectMap.get("drifting")?.records.size).toBe(1);
  });
});
