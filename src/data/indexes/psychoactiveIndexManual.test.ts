import { describe, expect, it } from "vitest";

import psychoactiveIndexManual from "./psychoactiveIndexManual.json";

const SEDATIVE_HYPNOTICS_DEFINITION =
  "**Sedative-hypnotics** are psychoactive substances that usually cause sedation, drowsiness, or sleep. This class holds several families of depressant drugs with different mechanisms: benzodiazepines, barbiturates, alcohol, GABA analogs, and some substances that act on voltage-gated calcium channels. Opioids have their own category.";

describe("psychoactive index manual", () => {
  it("defines sedative-hypnotics as an effect-led category with representative members", () => {
    const category = psychoactiveIndexManual.categories.find(({ key }) => key === "gabaergic");

    expect(category).toMatchObject({
      key: "gabaergic",
      iconKey: "gabaergic",
      label: "Sedative-hypnotics",
      definition: SEDATIVE_HYPNOTICS_DEFINITION,
    });

    const members = category?.sections.flatMap(({ drugs }) => drugs) ?? [];
    expect(new Set(members)).toHaveLength(51);
    expect(members).toContain("pregabalin");
    expect(members).not.toContain("morphine");
    expect(category?.sections.find(({ key }) => key === "common")?.drugs).toContain("alprazolam");
    expect(category?.sections.find(({ key }) => key === "benzodiazepines")?.drugs).toContain("alprazolam");
  });

  it("places every requested index substance in its intended section", () => {
    const expectedSections = {
      "2-fluorodeschloroketamine": ["dissociative", "arylcyclohexylamine"],
      "2m2b": ["gabaergic", "other-gabaergics"],
      "3-fa": ["stimulant", "amphetamine"],
      "4-aco-met": ["psychedelic", "tryptamine"],
      clonazolam: ["gabaergic", "benzodiazepines"],
      desoxypipradrol: ["stimulant", "other-stimulants"],
      dexmethylphenidate: ["stimulant", "other-stimulants"],
      dihydrocodeine: ["opioid", "morphinan"],
      eszopiclone: ["gabaergic", "z-drugs"],
      "f-phenibut": ["gabaergic", "gaba-analogues"],
      ghb: ["gabaergic", "gaba-analogues"],
      kanna: ["entactogen", "other-entactogens"],
      mephedrone: ["stimulant", "cathinone"],
      methallylescaline: ["psychedelic", "scaline"],
      "o-desmethyltramadol": ["opioid", "other-opioids"],
      phenibut: ["gabaergic", "gaba-analogues"],
    } as const;

    for (const [slug, [categoryKey, sectionKey]] of Object.entries(expectedSections)) {
      const category = psychoactiveIndexManual.categories.find(({ key }) => key === categoryKey);
      const section = category?.sections.find(({ key }) => key === sectionKey);

      expect(section?.drugs, `${slug} in ${categoryKey}/${sectionKey}`).toContain(slug);
    }
  });
});
