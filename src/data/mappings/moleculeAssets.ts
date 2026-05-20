import type { MoleculeAsset } from "../../types/content";
import manifest from "./moleculeAssetManifest.json";
import rawMappings from "./moleculeSvgMappings.json";

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

export type MoleculeAssetResolutionStatus =
  | "resolved-by-article-id"
  | "resolved-by-title"
  | "missing";

export interface MoleculeArticleIdentity {
  id?: number | null;
  title?: string | null;
  identification?: {
    common_name?: string | null;
    substitutive_name?: string | null;
    iupac_name?: string | null;
    alternative_names?: string[] | null;
  } | null;
}

export interface MoleculeAssetResolution {
  assets: MoleculeAsset[];
  status: MoleculeAssetResolutionStatus;
  matchedBy?: "article-id" | "title";
  matchedValue?: string;
}

export const MOLECULE_ASSET_MANIFEST_RELATIVE_PATH = manifest.mappingPath;
export const MOLECULE_ASSET_PUBLIC_PATH = manifest.publicPath;

let mappingByArticleId: Map<number, MoleculeMappingEntry[]> | null = null;
let mappingByTitle: Map<string, MoleculeMappingEntry[]> | null = null;

const mappingsFile = rawMappings as MoleculeMappingFile;

const isValidMapping = (entry: unknown): entry is MoleculeMappingEntry => {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const candidate = entry as Partial<MoleculeMappingEntry>;
  return (
    typeof candidate.articleId === "number" &&
    Number.isFinite(candidate.articleId) &&
    typeof candidate.filename === "string" &&
    candidate.filename.trim().length > 0
  );
};

const normalizeTitle = (title: string): string => title.toLowerCase().trim();

const addTitleIndex = (
  byTitle: Map<string, MoleculeMappingEntry[]>,
  title: string | null | undefined,
  entry: MoleculeMappingEntry,
) => {
  const normalizedTitle = title ? normalizeTitle(title) : "";
  if (!normalizedTitle) {
    return;
  }

  const existing = byTitle.get(normalizedTitle);
  if (existing) {
    existing.push(entry);
  } else {
    byTitle.set(normalizedTitle, [entry]);
  }
};

const buildIndex = (raw: MoleculeMappingFile) => {
  const byId = new Map<number, MoleculeMappingEntry[]>();
  const byTitle = new Map<string, MoleculeMappingEntry[]>();

  raw.mappings?.forEach((entry) => {
    if (!isValidMapping(entry)) {
      return;
    }

    const existing = byId.get(entry.articleId);
    if (existing) {
      existing.push(entry);
    } else {
      byId.set(entry.articleId, [entry]);
    }

    addTitleIndex(byTitle, entry.articleTitle, entry);
    addTitleIndex(byTitle, entry.matchedValue, entry);
  });

  return { byId, byTitle };
};

const buildIndexCaches = (raw: MoleculeMappingFile = mappingsFile) => {
  if (mappingByArticleId && mappingByTitle) {
    return;
  }

  const index = buildIndex(raw);
  mappingByArticleId = index.byId;
  mappingByTitle = index.byTitle;
};

const buildMoleculeAssets = (mappings: MoleculeMappingEntry[]): MoleculeAsset[] =>
  mappings.reduce<MoleculeAsset[]>((assets, mapping) => {
    const filename = mapping.filename.trim();
    if (!filename || assets.some((asset) => asset.filename === filename)) {
      return assets;
    }

    const encodedFilename = encodeURI(filename);
    const moleculeAsset: MoleculeAsset = {
      filename,
      url: `${MOLECULE_ASSET_PUBLIC_PATH}${encodedFilename}`,
      matchedField: mapping.matchedField,
      matchedValue: mapping.matchedValue,
    };

    if (mapping.resolution) {
      moleculeAsset.resolution = mapping.resolution;
    }

    if (Array.isArray(mapping.deduplicatedFrom) && mapping.deduplicatedFrom.length > 0) {
      moleculeAsset.deduplicatedFrom = mapping.deduplicatedFrom;
    }

    assets.push(moleculeAsset);
    return assets;
  }, []);

const getTitleCandidates = (identity: MoleculeArticleIdentity): string[] => {
  const candidates = [
    identity.title,
    identity.identification?.common_name,
    identity.identification?.substitutive_name,
    identity.identification?.iupac_name,
    ...(identity.identification?.alternative_names ?? []),
  ];
  const seen = new Set<string>();

  return candidates.reduce<string[]>((values, value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    const key = normalizeTitle(trimmed);
    if (!key || seen.has(key)) {
      return values;
    }
    seen.add(key);
    values.push(trimmed);
    return values;
  }, []);
};

export const resolveMoleculeAssetsForArticle = (
  identity: MoleculeArticleIdentity,
): MoleculeAssetResolution => {
  buildIndexCaches();
  return resolveMoleculeAssetsFromIndex(identity, {
    byId: mappingByArticleId,
    byTitle: mappingByTitle,
  });
};

const resolveMoleculeAssetsFromIndex = (
  identity: MoleculeArticleIdentity,
  index: {
    byId: Map<number, MoleculeMappingEntry[]> | null;
    byTitle: Map<string, MoleculeMappingEntry[]> | null;
  },
): MoleculeAssetResolution => {
  if (typeof identity.id === "number") {
    const matches = index.byId?.get(identity.id) ?? [];
    const assets = buildMoleculeAssets(matches);
    if (assets.length > 0) {
      return {
        assets,
        status: "resolved-by-article-id",
        matchedBy: "article-id",
        matchedValue: String(identity.id),
      };
    }
  }

  for (const title of getTitleCandidates(identity)) {
    const matches = index.byTitle?.get(normalizeTitle(title)) ?? [];
    const assets = buildMoleculeAssets(matches);
    if (assets.length > 0) {
      return {
        assets,
        status: "resolved-by-title",
        matchedBy: "title",
        matchedValue: title,
      };
    }
  }

  return {
    assets: [],
    status: "missing",
  };
};

export const createMoleculeAssetCatalog = (raw: MoleculeMappingFile) => {
  const index = buildIndex(raw);

  return {
    resolveArticle(identity: MoleculeArticleIdentity): MoleculeAssetResolution {
      return resolveMoleculeAssetsFromIndex(identity, index);
    },
  };
};

export const getMoleculeAssetsByArticleId = async (
  articleId: number,
): Promise<MoleculeAsset[]> => {
  return resolveMoleculeAssetsForArticle({ id: articleId }).assets;
};

export const getMoleculeUrlByTitle = async (title: string): Promise<string | null> => {
  return resolveMoleculeAssetsForArticle({ title }).assets[0]?.url ?? null;
};
