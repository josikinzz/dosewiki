import promptRegistryJson from "@content/prompts/registry.json";
import {
  getCatalogSectionPromptDescriptors,
  type CatalogSectionPromptDescriptor,
  type CatalogSectionPromptKey,
} from "@/schema/substance/sectionCatalog";


type PromptSourceMaterial = "none" | "extracted"

export type SectionKey = "base" | CatalogSectionPromptKey;

type FormalCitationSectionKey = | "summary"
| "pharmacology"
| "harm_potential"
| "legality"
| "history_culture"
| "tolerance"

export type PromptDescriptor =
  | {
      key: "generator";
      kind: "generator";
      label: string;
      seedPath: string;
      dataKey: "generator";
      editorVisible: boolean;
    }
  | {
      key: "formal_citations_agent";
      kind: "formal_citations_agent";
      label: string;
      description: string;
      seedPath: string;
      dataKey: "formal_citations_agent";
      editorVisible: boolean;
    }
  | {
      key: `formal_citations_section_${FormalCitationSectionKey}`;
      kind: "formal_citations_section";
      citationSectionKey: FormalCitationSectionKey;
      label: string;
      description: string;
      seedPath: string;
      dataKey: `formal_citations_section_${FormalCitationSectionKey}`;
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
      dataKey: `section_${SectionKey}`;
      sourceMaterial: PromptSourceMaterial;
      editorVisible: boolean;
    };

const catalogSectionPromptDescriptors = getCatalogSectionPromptDescriptors();
const catalogSectionPromptDescriptorsByKey = new Map<string, CatalogSectionPromptDescriptor>(
  catalogSectionPromptDescriptors.map((descriptor) => [descriptor.sectionKey, descriptor]),
);

export const promptRegistry = promptRegistryJson.map((descriptor) => {
  if (descriptor.kind !== "section" || descriptor.sectionKey === "base") {
    return descriptor;
  }

  return catalogSectionPromptDescriptorsByKey.get(descriptor.sectionKey) ?? descriptor;
}) as PromptDescriptor[];

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
  return getFormalCitationSectionPromptDescriptor(sectionKey).dataKey;
}

export function sectionKeyToPromptKey(sectionKey: SectionKey): `section_${SectionKey}` {
  return getSectionPromptDescriptor(sectionKey).dataKey;
}

export function getPromptDescriptorByKey(key: string): PromptDescriptor | undefined {
  return promptRegistry.find((descriptor) => descriptor.dataKey === key);
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


