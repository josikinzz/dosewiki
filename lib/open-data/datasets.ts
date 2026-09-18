import "server-only";

import {
  getPublicEffectArticles,
  getPublicFullSubstanceDocuments,
  getPublicReportDetails,
} from "../data/publicData";

/**
 * The public open-data JSON downloads under `/open-data`, described once so the
 * serving routes and the download buttons that advertise them agree on the file.
 *
 * Each dataset is a daily snapshot read live from Postgres through the cached
 * lib adapters: the serving routes revalidate once a day and the `vercel.json`
 * crons warm them nightly, so no static file regeneration is involved.
 */
export const OPEN_DATA_CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=86400";

/**
 * dose.wiki's substance prose, the schema, and the normalization work are CC0,
 * but every article document also carries an `interactions` object populated
 * from TripSit combination guidance, which keeps TripSit's non-commercial
 * attribution terms; the reuse matrix at {@link OPEN_DATA_LICENSE_URL} is
 * authoritative. A blanket CC0 claim on this dataset would be false.
 */
export const OPEN_DATA_SUBSTANCE_INDEX_LICENSE =
  "Mixed — CC0 except the interactions field, which keeps TripSit's non-commercial attribution terms";

/**
 * Effect prose and the index structure are CC0, but the records reference
 * replication media (`audio_replications` entries plus the `gallery_order` and
 * `social_media_image` image references) credited to third-party creators who
 * retain their rights, so this dataset cannot be dedicated wholesale either.
 */
export const OPEN_DATA_EFFECT_INDEX_LICENSE =
  "Mixed — CC0 except the replication media it references, whose rights remain with the credited creator or rightsholder";

/**
 * dose.wiki-authored trip report prose is CC0, but legacy report rights remain
 * with their authors unless marked otherwise; the reuse matrix at
 * {@link OPEN_DATA_LICENSE_URL} is authoritative. A blanket CC0 claim on this
 * dataset would be false.
 */
export const OPEN_DATA_TRIP_REPORT_LICENSE =
  "Mixed — rights to legacy trip reports remain with their authors unless marked otherwise";

export const OPEN_DATA_LICENSE_URL = "https://dose.wiki/docs/license";

export const OPEN_DATA_SOURCE = "https://dose.wiki";

export type OpenDataDatasetName = "SubstanceIndex" | "EffectIndex" | "TripReports";

export type OpenDataDataset = {
  /** Envelope name and attachment filename stem, e.g. "SubstanceIndex". */
  readonly name: OpenDataDatasetName;
  /** SPDX id or descriptive terms; {@link OPEN_DATA_LICENSE_URL} has the full matrix. */
  readonly license: string;
  /** "id" mirrors the SubstanceIndex.json export order; "slug" elsewhere. */
  readonly sortBy: "id" | "slug";
  /** Internal-only fields to strip beyond the Postgres bookkeeping pair. */
  readonly stripFields: readonly string[];
  /** Every record the file publishes, read live from Postgres. */
  readonly loadItems: () => Promise<readonly unknown[]>;
};

export const OPEN_DATA_DATASETS: Readonly<Record<OpenDataDatasetName, OpenDataDataset>> = {
  /**
   * Every published substance article as a full document, the same record
   * shape as the local `src/data/SubstanceIndex.json` export minus internal
   * editorial metadata. Substances still being written or deliberately unlisted
   * (`priority` of `low` or `hide_for_now`) are excluded: they are not finished
   * or reviewed. `editorial_review` names the reviewing editor and
   * `section_gaps` tracks unfinished editorial work; both are moderation
   * bookkeeping, not article content. The documents keep their `interactions`
   * object, which is TripSit-derived, so the envelope license is mixed rather
   * than CC0.
   */
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
  /**
   * The complete Subjective Effect Index as full effect detail records. Records
   * reference replication media credited to third-party creators that retain
   * their rights, so the envelope license is mixed rather than CC0.
   */
  EffectIndex: {
    name: "EffectIndex",
    license: OPEN_DATA_EFFECT_INDEX_LICENSE,
    sortBy: "slug",
    stripFields: [],
    loadItems: () => getPublicEffectArticles(),
  },
  /**
   * All published trip reports as full detail records. Reads only the published
   * `tripReports` table (submissions never appear) and drops the editorial
   * attribution-review stamp, which names the reviewing editor and is internal
   * moderation metadata.
   */
  TripReports: {
    name: "TripReports",
    license: OPEN_DATA_TRIP_REPORT_LICENSE,
    sortBy: "slug",
    stripFields: ["attribution_review"],
    loadItems: () => getPublicReportDetails(),
  },
};

type OpenDataRecord = Record<string, unknown>;

/**
 * Build the published document: strips Postgres internals (`_id`,
 * `_creationTime`) plus the dataset's internal fields, orders items
 * deterministically, and wraps them in the envelope. `json` is exactly what the
 * route gzips, so its byte length is the size of the file a reader saves.
 */
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
    // Null ids sink to the end, mirroring scripts/data-ops/export-data-to-json.mjs.
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
