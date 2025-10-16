import articles from "./articles";
import { buildSubstanceRecord, slugifyDrugName } from "./contentBuilder";

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
  });

if (!lsdRecord) {
  throw new Error(`Unable to locate ${LSD_KEY} content in articles.json`);
}

export const lsdContent = lsdRecord.content;
export const lsdSlug = lsdRecord.slug;
export const lsdMetadata = lsdRecord;
