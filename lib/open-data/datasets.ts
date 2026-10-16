import "server-only";

import {
  getPublicEffectArticles,
  getPublicFullSubstanceDocuments,
  getPublicReportDetails,
} from "../data/publicData";

export const OPEN_DATA_CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=86400";

export const OPEN_DATA_SUBSTANCE_INDEX_LICENSE =
  "Mixed: CC0 except the interactions field, which keeps TripSit's non-commercial attribution terms";

export const OPEN_DATA_EFFECT_INDEX_LICENSE =
  "Mixed: CC0 except the replication media it references, whose rights remain with the credited creator or rightsholder";

export const OPEN_DATA_TRIP_REPORT_LICENSE =
  "Mixed: rights to legacy trip reports remain with their authors unless marked otherwise";

export const OPEN_DATA_LICENSE_URL = "https://dose.wiki/docs/license";

export const OPEN_DATA_SOURCE = "https://dose.wiki";

export type OpenDataDatasetName = "SubstanceIndex" | "EffectIndex" | "TripReports";

export type OpenDataDataset = {
  readonly name: OpenDataDatasetName;
  readonly license: string;
  readonly sortBy: "id" | "slug";
  readonly stripFields: readonly string[];
  readonly loadItems: () => Promise<readonly unknown[]>;
};

export const OPEN_DATA_DATASETS: Readonly<Record<OpenDataDatasetName, OpenDataDataset>> = {
  SubstanceIndex: {
    name: "SubstanceIndex",
    license: OPEN_DATA_SUBSTANCE_INDEX_LICENSE,
    sortBy: "id",
    stripFields: ["editorial_review", "section_gaps"],
    loadItems: async () =>
      (await getPublicFullSubstanceDocuments()).filter(
        (document) => document.priority !== "low" && document.priority !== "hide_for_now",
      ),
  },
  EffectIndex: {
    name: "EffectIndex",
    license: OPEN_DATA_EFFECT_INDEX_LICENSE,
    sortBy: "slug",
    stripFields: [],
    loadItems: () => getPublicEffectArticles(),
  },
  TripReports: {
    name: "TripReports",
    license: OPEN_DATA_TRIP_REPORT_LICENSE,
    sortBy: "slug",
    stripFields: ["attribution_review"],
    loadItems: () => getPublicReportDetails(),
  },
};

type OpenDataRecord = Record<string, unknown>;

export async function buildOpenDataDocument(
  dataset: OpenDataDataset,
): Promise<{ count: number; json: string }> {
  const items = (await dataset.loadItems()).map((item): OpenDataRecord => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return item as unknown as OpenDataRecord;
    }
    const record = { ...(item as OpenDataRecord) };
    delete record._id;
    delete record._creationTime;
    for (const field of dataset.stripFields) {
      delete record[field];
    }
    return record;
  });

  if (dataset.sortBy === "id") {
    items.sort((left, right) => {
      const leftId = typeof left.id === "number" ? left.id : null;
      const rightId = typeof right.id === "number" ? right.id : null;
      if (leftId === null && rightId === null) return 0;
      if (leftId === null) return 1;
      if (rightId === null) return -1;
      return leftId - rightId;
    });
  } else {
    items.sort((left, right) =>
      String(left.slug ?? "").localeCompare(String(right.slug ?? "")),
    );
  }

  return {
    count: items.length,
    json: JSON.stringify({
      dataset: dataset.name,
      generatedAt: new Date().toISOString(),
      count: items.length,
      license: dataset.license,
      licenseUrl: OPEN_DATA_LICENSE_URL,
      source: OPEN_DATA_SOURCE,
      items,
    }),
  };
}
