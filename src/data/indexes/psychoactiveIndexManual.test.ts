import { describe, expect, it } from "vitest";

import psychoactiveIndexManual from "./psychoactiveIndexManual.json";

const SEDATIVE_HYPNOTICS_DEFINITION =
  "**Sedative-hypnotics** are psychoactive substances that usually cause sedation, drowsiness, or sleep. This class holds several families of depressant drugs with different mechanisms: benzodiazepines, barbiturates, alcohol, GABA analogs, and some substances that act on voltage-gated calcium channels. Opioids have their own category.";

describe("psychoactive index manual", () => {
  it("defines sedative-hypnotics as an effect-led category without changing its stable layout key or members", () => {
    const category = psychoactiveIndexManual.categories.find(({ key }) => key === "gabaergic");

    expect(category).toMatchObject({
      key: "gabaergic",
      iconKey: "gabaergic",
      label: "Sedative-hypnotics",
      definition: SEDATIVE_HYPNOTICS_DEFINITION,
    });

    const members = category?.sections.flatMap(({ drugs }) => drugs) ?? [];
    expect(members).toHaveLength(43);
    expect(members).toContain("pregabalin");
    expect(members).not.toContain("morphine");
  });
});
