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
    expect(members).toHaveLength(44);
    expect(members).toContain("pregabalin");
    expect(members).not.toContain("morphine");
  });

  it("places requested high-priority substances in their intended sections", () => {
    const expectedSections = {
      "2-fluorodeschloroketamine": ["dissociative", "arylcyclohexylamine"],
      "3-fa": ["stimulant", "amphetamine"],
      clonazepam: ["gabaergic", "benzodiazepines"],
      desoxypipradrol: ["stimulant", "other-stimulants"],
      dexmethylphenidate: ["stimulant", "other-stimulants"],
      dihydrocodeine: ["opioid", "morphinan"],
      "f-phenibut": ["gabaergic", "gaba-analogues"],
      methallylescaline: ["psychedelic", "scaline"],
      "o-desmethyltramadol": ["opioid", "other-opioids"],
    } as const;

    for (const [slug, [categoryKey, sectionKey]] of Object.entries(expectedSections)) {
      const category = psychoactiveIndexManual.categories.find(({ key }) => key === categoryKey);
      const section = category?.sections.find(({ key }) => key === sectionKey);

      expect(section?.drugs, `${slug} in ${categoryKey}/${sectionKey}`).toContain(slug);
    }
  });
});
