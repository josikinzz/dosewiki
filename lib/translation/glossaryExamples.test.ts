import { describe, expect, it } from "vitest";
import { buildGlossaryExample, trimAround } from "./glossaryExamples";

const ENGLISH =
  "2-Benzylpiperidines are a chemical class of organic compounds derived from the core amphetamine structure in which the amine nitrogen is incorporated into a piperidine ring attached at the benzylic position. Members differ by ring substituents and by the groups attached to the piperidine. Most act as stimulants through inhibition of dopamine and noradrenaline reuptake. The phenidates, esters built on this scaffold, are the best-known branch of the family.";
const CHINESE =
  "2-苄基哌啶类是一类由苯丙胺核心结构衍生而来的有机化合物，其中胺氮并入一个连接在苄位的哌啶环中。各成员的差异在于环上取代基以及连接于哌啶环的基团。大多数成员通过抑制多巴胺和去甲肾上腺素再摄取而发挥兴奋作用。以这一骨架构建的酯类，，phenidates，，是该家族最知名的分支。";
const candidate = { hash: "h-benzyl", english: ENGLISH, href: "/chemical-classes/2-benzylpiperidines" };

describe("glossary examples", () => {
  it("takes the first usage with a stored translation and trims both sides around the term", () => {
    const example = buildGlossaryExample(
      { term: "Phenidate", target: "Phenidate" },
      [{ hash: "untranslated", english: "Phenidate dosing.", href: "/first" }, candidate],
      new Map([["h-benzyl", CHINESE]]),
    );
    expect(example?.href).toBe("/chemical-classes/2-benzylpiperidines");
    // The shared matcher finds the inflected form.
    expect(example?.english).toContain("The phenidates, esters built on this scaffold");
    expect(example?.english.startsWith("…")).toBe(true);
    expect(example?.english.length).toBeLessThan(ENGLISH.length);
    expect(example?.target).toContain("phenidates");
    expect(example?.target).toContain("以这一骨架构建的酯类");
    expect(example?.target.startsWith("…")).toBe(true);
    expect(example?.target.length).toBeLessThan(CHINESE.length);
  });

  it("returns nothing when no usage has a stored translation", () => {
    expect(buildGlossaryExample({ term: "Phenidate", target: "Phenidate" }, [candidate], new Map())).toBeNull();
    expect(buildGlossaryExample({ term: "Phenidate", target: "Phenidate" }, [], new Map([["h-benzyl", CHINESE]]))).toBeNull();
  });

  it("keeps a short sentence whole and cuts long English at a space", () => {
    expect(trimAround("Tracers recur.", 0, 7, 60)).toBe("Tracers recur.");
    const cut = trimAround("one two three four five six seven", 14, 18, 6);
    expect(cut).toBe("…three four five…");
  });
});
