import articles from "./articles";
import { buildSubstanceRecord, slugifyDrugName } from "./builders/contentBuilder";
import type { SubstanceRecord } from "../types/content";

const LSD_KEY = "LSD";

const lsdRecord = articles
  .map((article) => buildSubstanceRecord(article))
  .filter((record): record is NonNullable<typeof record> => Boolean(record))
  .find((record) => {
    if (!record) {
      return false;
    }

    const matchesName = record.name.toLowerCase() === LSD_KEY.toLowerCase();
    if (matchesName) {
      return true;
    }

    const derivedSlug = slugifyDrugName(record.name, `article-${record.id ?? "unknown"}`);
    return derivedSlug === LSD_KEY.toLowerCase();
  }) ?? null;

export const lsdContent = lsdRecord?.content ?? null;
export const lsdSlug = lsdRecord?.slug ?? null;
export const lsdMetadata: SubstanceRecord | null = lsdRecord;
