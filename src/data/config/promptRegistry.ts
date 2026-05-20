import promptRegistryJson from "./promptRegistry.json";

export type PromptKind =
  | "generator"
  | "section"
  | "formal_citations_agent"
  | "formal_citations_section";
export type PromptSourceMaterial = "none" | "extracted";

export type SectionKey =
  | "base"
  | "harm_potential"
  | "dosage_duration"
  | "subjective_effects"
  | "pharmacology"
  | "interactions"
  | "tolerance"
  | "history_culture"
  | "legality"
  | "identification"
  | "summary";

export type FormalCitationSectionKey =
  | "dosage_duration"
  | "pharmacology"
  | "harm_potential"
  | "legality"
  | "history_culture"
  | "tolerance";

export type PromptDescriptor =
  | {
      key: "generator";
      kind: "generator";
      label: string;
      seedPath: string;
      convexKey: "generator";
      editorVisible: boolean;
    }
  | {
      key: "formal_citations_agent";
      kind: "formal_citations_agent";
      label: string;
      description: string;
      seedPath: string;
      convexKey: "formal_citations_agent";
      editorVisible: boolean;
    }
  | {
      key: `formal_citations_section_${FormalCitationSectionKey}`;
      kind: "formal_citations_section";
      citationSectionKey: FormalCitationSectionKey;
      label: string;
      description: string;
      seedPath: string;
      convexKey: `formal_citations_section_${FormalCitationSectionKey}`;
      sourceMaterial: PromptSourceMaterial;
      editorVisible: boolean;
    }
  | {
      key: `section_${SectionKey}`;
      kind: "section";
      sectionKey: SectionKey;
      label: string;
      description: string;
      seedPath: string;
      convexKey: `section_${SectionKey}`;
      sourceMaterial: PromptSourceMaterial;
      editorVisible: boolean;
    };

export const promptRegistry = promptRegistryJson as PromptDescriptor[];

export const sectionPromptDescriptors = promptRegistry.filter(
  (descriptor): descriptor is Extract<PromptDescriptor, { kind: "section" }> =>
    descriptor.kind === "section",
);

export const formalCitationPromptDescriptors = promptRegistry.filter(
  (
    descriptor,
  ): descriptor is Extract<PromptDescriptor, { kind: "formal_citations_section" }> =>
    descriptor.kind === "formal_citations_section",
);

export function formalCitationSectionKeyToPromptKey(
  sectionKey: FormalCitationSectionKey,
): `formal_citations_section_${FormalCitationSectionKey}` {
  return getFormalCitationSectionPromptDescriptor(sectionKey).convexKey;
}

export function sectionKeyToPromptKey(sectionKey: SectionKey): `section_${SectionKey}` {
  return getSectionPromptDescriptor(sectionKey).convexKey;
}

export function getPromptDescriptorByKey(key: string): PromptDescriptor | undefined {
  return promptRegistry.find((descriptor) => descriptor.convexKey === key);
}

export function getSectionPromptDescriptor(sectionKey: SectionKey) {
  const descriptor = sectionPromptDescriptors.find((entry) => entry.sectionKey === sectionKey);
  if (!descriptor) {
    throw new Error(`Unknown section prompt key: ${sectionKey}`);
  }
  return descriptor;
}

export function getFormalCitationAgentPromptDescriptor() {
  const descriptor = promptRegistry.find(
    (entry): entry is Extract<PromptDescriptor, { kind: "formal_citations_agent" }> =>
      entry.kind === "formal_citations_agent",
  );
  if (!descriptor) {
    throw new Error("Missing formal citations agent prompt descriptor.");
  }
  return descriptor;
}

export function getFormalCitationSectionPromptDescriptor(sectionKey: FormalCitationSectionKey) {
  const descriptor = formalCitationPromptDescriptors.find(
    (entry) => entry.citationSectionKey === sectionKey,
  );
  if (!descriptor) {
    throw new Error(`Unknown formal citation section prompt key: ${sectionKey}`);
  }
  return descriptor;
}

export function isKnownPromptKey(key: string): boolean {
  return getPromptDescriptorByKey(key) !== undefined;
}

export function assertKnownPromptKey(key: string): void {
  if (!isKnownPromptKey(key)) {
    throw new Error(`Unknown prompt key: ${key}`);
  }
}
