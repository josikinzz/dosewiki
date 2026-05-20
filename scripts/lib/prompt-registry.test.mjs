import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  formalCitationPromptDescriptors,
  formalCitationSectionKeyToPromptKey,
  promptRegistry,
  sectionPromptDescriptors,
  sectionKeyToPromptKey,
  isKnownPromptKey,
} from "./prompt-registry.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");

describe("prompt registry", () => {
  it("defines unique Convex keys and existing local seed paths", () => {
    const convexKeys = promptRegistry.map((descriptor) => descriptor.convexKey);
    expect(new Set(convexKeys).size).toBe(convexKeys.length);

    for (const descriptor of promptRegistry) {
      expect(descriptor.key).toBe(descriptor.convexKey);
      expect(existsSync(path.join(PROJECT_ROOT, descriptor.seedPath))).toBe(true);
    }
  });

  it("converts section keys to preserved Convex prompt keys", () => {
    expect(sectionKeyToPromptKey("harm_potential")).toBe("section_harm_potential");
    expect(sectionKeyToPromptKey("dosage_duration")).toBe("section_dosage_duration");
    expect(sectionKeyToPromptKey("summary")).toBe("section_summary");
  });

  it("keeps section prompt descriptors complete for editor metadata", () => {
    const sectionKeys = sectionPromptDescriptors.map((descriptor) => descriptor.sectionKey);

    expect(sectionKeys).toContain("summary");
    expect(sectionKeys).toContain("base");
    expect(sectionPromptDescriptors.every((descriptor) => descriptor.label && descriptor.seedPath)).toBe(true);
    expect(sectionPromptDescriptors.every((descriptor) => isKnownPromptKey(descriptor.convexKey))).toBe(true);
  });

  it("registers formal citations prompts in the shared prompt inventory", () => {
    const sectionKeys = formalCitationPromptDescriptors.map((descriptor) => descriptor.citationSectionKey);

    expect(promptRegistry.some((descriptor) => descriptor.convexKey === "formal_citations_agent")).toBe(true);
    expect(sectionKeys).toEqual(expect.arrayContaining([
      "dosage_duration",
      "pharmacology",
      "harm_potential",
      "legality",
      "history_culture",
      "tolerance",
    ]));
    expect(formalCitationSectionKeyToPromptKey("pharmacology")).toBe("formal_citations_section_pharmacology");
    expect(formalCitationPromptDescriptors.every((descriptor) => isKnownPromptKey(descriptor.convexKey))).toBe(true);
  });
});
