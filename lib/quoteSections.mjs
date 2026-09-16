const QUOTE_SECTION_DESCRIPTORS = [
  {
    id: "summary",
    label: "Intro Text Quotes",
    promptKey: "summary",
    extractionCategory: "intro-text",
    aliases: ["intro_text", "intro-text"],
    storageMode: "data",
    outputDir: "quotes/intro-text-quotes",
    outputSuffix: "-intro-text.md",
    promptFile: "intro-text-extraction.md",
    availability: true,
    excludedSources: [],
  },
  {
    id: "harm_potential",
    label: "Harm Potential Quotes",
    promptKey: "harm_potential",
    extractionCategory: "harm-potential",
    aliases: ["harm-potential", "harmpotential"],
    storageMode: "data",
    outputDir: "quotes/harmpotential-quotes",
    outputSuffix: "-harmpotential.md",
    promptFile: "harm-potential-extraction.md",
    availability: true,
    excludedSources: [],
  },
  {
    id: "pharmacology",
    label: "Pharmacology Quotes",
    promptKey: "pharmacology",
    extractionCategory: "pharmacology",
    aliases: [],
    storageMode: "data",
    outputDir: "quotes/pharmacology-quotes",
    outputSuffix: "-pharmacology.md",
    promptFile: "pharmacology-extraction.md",
    availability: true,
    excludedSources: [],
  },
  {
    id: "history_culture",
    label: "History & Culture Quotes",
    promptKey: "history_culture",
    extractionCategory: "history-culture",
    aliases: ["history-culture"],
    storageMode: "data",
    outputDir: "quotes/history-culture-quotes",
    outputSuffix: "-history-culture.md",
    promptFile: "history-culture-extraction.md",
    availability: true,
    excludedSources: [],
  },
  {
    id: "dosage_duration",
    label: "Dosage & Duration Quotes",
    promptKey: "dosage_duration",
    extractionCategory: "dosage-duration",
    aliases: ["dosage-duration"],
    storageMode: "local-file",
    outputDir: "quotes/dosage-duration-quotes",
    outputSuffix: "-dosage-duration.md",
    promptFile: "dosage-duration-extraction.md",
    availability: true,
    excludedSources: [],
  },
  {
    id: "tolerance",
    label: "Tolerance Quotes",
    promptKey: "tolerance",
    extractionCategory: "tolerance",
    aliases: [],
    storageMode: "data",
    outputDir: "quotes/tolerance-quotes",
    outputSuffix: "-tolerance.md",
    promptFile: "tolerance-extraction.md",
    availability: true,
    excludedSources: [],
  },
  {
    id: "legality",
    label: "Legality Quotes",
    promptKey: "legality",
    extractionCategory: "legality",
    aliases: [],
    storageMode: "data",
    outputDir: "quotes/legality-quotes",
    outputSuffix: "-legality.md",
    promptFile: "legality-extraction.md",
    availability: true,
    excludedSources: [],
  },
  {
    id: "subjective_effects",
    label: "Subjective Effects Quotes",
    promptKey: "subjective_effects",
    extractionCategory: "subjective-effects",
    aliases: ["subjective-effects"],
    storageMode: "data",
    outputDir: "quotes/subjective-effects-quotes",
    outputSuffix: "-subjective-effects.md",
    promptFile: "subjective-effects-extraction.md",
    availability: true,
    excludedSources: ["psychonautwiki", "disregardeverythingisay"],
  },
];

const sectionById = new Map();
const sectionByName = new Map();

for (const descriptor of QUOTE_SECTION_DESCRIPTORS) {
  sectionById.set(descriptor.id, descriptor);
  for (const key of [descriptor.id, descriptor.extractionCategory, ...descriptor.aliases]) {
    sectionByName.set(key, descriptor);
  }
}


export function getAvailabilityQuoteSectionIds() {
  return QUOTE_SECTION_DESCRIPTORS
    .filter((descriptor) => descriptor.availability)
    .map((descriptor) => descriptor.id);
}

function resolveQuoteSection(section) { if (typeof section !== "string") {
  return null;
}

return sectionByName.get(section.trim()) ?? null; }

export function normalizeQuoteSectionId(section) {
  return resolveQuoteSection(section)?.id ?? null;
}

export function requireQuoteSection(section) {
  const descriptor = resolveQuoteSection(section);
  if (!descriptor) {
    throw new Error(`Unknown quote section: ${section}`);
  }
  return descriptor;
}

export function getQuoteSectionById(sectionId) {
  return sectionById.get(sectionId) ?? null;
}

export function getQuoteExtractionCategories() {
  return Object.fromEntries(
    QUOTE_SECTION_DESCRIPTORS
      .filter((descriptor) => descriptor.promptFile)
      .map((descriptor) => [
        descriptor.extractionCategory,
        {
          section: descriptor.id,
          promptFile: descriptor.promptFile,
          outputDir: descriptor.outputDir,
          outputSuffix: descriptor.outputSuffix,
          title: descriptor.label,
          excludedSources: descriptor.excludedSources,
        },
      ]),
  );
}

export function getLocalQuoteArtifactDescriptors() {
  return QUOTE_SECTION_DESCRIPTORS
    .filter((descriptor) => descriptor.outputDir && descriptor.outputSuffix)
    .map((descriptor) => ({
      path: `../../${descriptor.outputDir}`,
      section: descriptor.id,
      suffix: descriptor.outputSuffix,
      storageMode: descriptor.storageMode,
    }));
}
