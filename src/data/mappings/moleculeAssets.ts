import type { MoleculeAsset } from "../../types/content";

interface MoleculeMappingEntry {
  filename: string;
  articleId: number;
  articleTitle: string;
  matchedField: string;
  matchedValue: string;
  resolution?: string;
  deduplicatedFrom?: string[];
}

interface MoleculeMappingFile {
  mappings: MoleculeMappingEntry[];
}

let mappingsPromise: Promise<MoleculeMappingFile> | null = null;
let mappingsCache: MoleculeMappingFile | null = null;
let mappingByArticleId: Map<number, MoleculeMappingEntry[]> | null = null;
let mappingByTitle: Map<string, MoleculeMappingEntry> | null = null;

const loadMappings = async (): Promise<MoleculeMappingFile> => {
  if (mappingsCache) {
    return mappingsCache;
  }
  if (!mappingsPromise) {
    mappingsPromise = import("./moleculeSvgMappings.json").then((module) => {
      const data = (module as { default?: MoleculeMappingFile }).default ?? module;
      return data as MoleculeMappingFile;
    });
  }
  mappingsCache = await mappingsPromise;
  return mappingsCache;
};

const buildIndexCaches = (raw: MoleculeMappingFile) => {
  if (mappingByArticleId && mappingByTitle) {
    return;
  }

  const byId = new Map<number, MoleculeMappingEntry[]>();
  const byTitle = new Map<string, MoleculeMappingEntry>();

  raw.mappings?.forEach((entry) => {
    if (!entry || typeof entry.articleId !== "number" || !entry.filename) {
      return;
    }

    const existing = byId.get(entry.articleId);
    if (existing) {
      existing.push(entry);
    } else {
      byId.set(entry.articleId, [entry]);
    }

    if (entry.articleTitle) {
      const normalizedTitle = entry.articleTitle.toLowerCase().trim();
      if (normalizedTitle && !byTitle.has(normalizedTitle)) {
        byTitle.set(normalizedTitle, entry);
      }
    }
  });

  mappingByArticleId = byId;
  mappingByTitle = byTitle;
};

const buildMoleculeAssets = (mappings: MoleculeMappingEntry[]): MoleculeAsset[] =>
  mappings.map((mapping) => {
    const encodedFilename = encodeURI(mapping.filename);
    const moleculeAsset: MoleculeAsset = {
      filename: mapping.filename,
      url: `/molecules/${encodedFilename}`,
      matchedField: mapping.matchedField,
      matchedValue: mapping.matchedValue,
    };

    if (mapping.resolution) {
      moleculeAsset.resolution = mapping.resolution;
    }

    if (Array.isArray(mapping.deduplicatedFrom) && mapping.deduplicatedFrom.length > 0) {
      moleculeAsset.deduplicatedFrom = mapping.deduplicatedFrom;
    }

    return moleculeAsset;
  });

export const getMoleculeAssetsByArticleId = async (
  articleId: number,
): Promise<MoleculeAsset[]> => {
  const raw = await loadMappings();
  buildIndexCaches(raw);
  const matches = mappingByArticleId?.get(articleId) ?? [];
  if (matches.length === 0) {
    return [];
  }
  return buildMoleculeAssets(matches);
};

export const getMoleculeUrlByTitle = async (title: string): Promise<string | null> => {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }

  const raw = await loadMappings();
  buildIndexCaches(raw);

  const normalizedTitle = trimmed.toLowerCase();
  const match = mappingByTitle?.get(normalizedTitle);
  return match ? `/molecules/${encodeURI(match.filename)}` : null;
};
