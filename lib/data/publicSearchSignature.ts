import type { PublicEffectArticle, PublicReportPreview } from "./publicData.shared";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

/** Content-derived revision of the non-library public search sources. */

/**
 * FNV-1a, the same fold `getSearchIndexInputHash` uses. Non-cryptographic on
 * purpose: the digest only has to move when a row moves, never resist forgery.
 */
const SIGNATURE_OFFSET_BASIS = 2166136261;
const SIGNATURE_PRIME = 16777619;
/** Unit separator, so neighbouring field values cannot fold into one another. */
const SIGNATURE_FIELD_BREAK = 31;
/** Absent field marker, keeping `undefined` distinct from the empty string. */
const SIGNATURE_ABSENT = 30;

function foldText(hash: number, value: string | null | undefined): number {
  if (typeof value !== "string") {
    return Math.imul(hash ^ SIGNATURE_ABSENT, SIGNATURE_PRIME);
  }

  let next = hash;
  for (let index = 0; index < value.length; index += 1) {
    next = Math.imul(next ^ value.charCodeAt(index), SIGNATURE_PRIME);
  }

  return Math.imul(next ^ SIGNATURE_FIELD_BREAK, SIGNATURE_PRIME);
}

function foldNumber(hash: number, value: number): number {
  return foldText(hash, value.toString(36));
}

/**
 * Long-form bodies are folded by length alone: reading `String.length` is free,
 * folding kilobytes of markdown per row per request is not.
 */
function foldTextLength(hash: number, value: string | null | undefined): number {
  return foldNumber(hash, typeof value === "string" ? value.length : -1);
}

function foldTextList(hash: number, values: readonly string[] | undefined): number {
  let next = foldNumber(hash, values?.length ?? -1);
  for (const value of values ?? []) {
    next = foldText(next, value);
  }

  return next;
}

/** Identity `slug`. No revision column reaches the public projection. */
function foldEffectArticle(hash: number, effect: PublicEffectArticle): number {
  let next = foldText(hash, effect.slug);
  next = foldText(next, effect.name);
  next = foldText(next, effect.summary);
  next = foldTextList(next, effect.tags);
  next = foldText(next, effect.featured === true ? "1" : "0");
  next = foldTextLength(next, effect.description_raw);
  next = foldTextLength(next, effect.long_summary_raw);
  next = foldTextLength(next, effect.analysis_raw);
  next = foldTextLength(next, effect.style_variations_raw);
  next = foldTextLength(next, effect.personal_commentary_raw);

  return foldNumber(next, effect.see_also?.length ?? -1);
}

/** Identity `slug`. `introduction` is already the trimmed narrative excerpt. */
function foldReportPreview(hash: number, report: PublicReportPreview): number {
  let next = foldText(hash, report.slug);
  next = foldText(next, report.title);
  next = foldText(next, report.author);
  next = foldText(next, report.authorProfileKey);
  next = foldText(next, report.featured === true ? "1" : "0");
  next = foldTextList(next, report.substanceNames);
  next = foldNumber(next, report.substances?.length ?? -1);
  for (const substance of report.substances ?? []) {
    next = foldText(next, substance.name);
    next = foldText(next, substance.dose);
    next = foldText(next, substance.roa);
  }
  next = foldText(next, report.introduction);
  next = foldText(next, report.tripDate);
  next = foldText(next, report.age);
  next = foldText(next, report.gender);
  next = foldText(next, report.height);
  next = foldText(next, report.weight);
  next = foldText(next, report.medications);

  return foldText(next, report.setting);
}

/**
 * Identity `key`. Aliases stay out, exactly as they stay out of the index:
 * they can carry internal reviewer handles that public search must never
 * match, so they must not force a rebuild either.
 */
function foldContributorProfile(hash: number, profile: NormalizedUserProfile): number {
  let next = foldText(hash, profile.key);
  next = foldText(next, profile.displayName);
  next = foldText(next, profile.hasCustomBio === true ? "1" : "0");

  return foldText(next, profile.bio);
}

/**
 * Revision of the non-library search sources. Substance changes are caught by
 * the library instance; these projections need a content-derived identity.
 */
export function buildSearchSourceSignature(
  effectDefinitions: readonly PublicEffectArticle[],
  reports: readonly PublicReportPreview[],
  profiles: readonly NormalizedUserProfile[],
): string {
  let hash = foldNumber(SIGNATURE_OFFSET_BASIS, effectDefinitions.length);
  for (const effect of effectDefinitions) hash = foldEffectArticle(hash, effect);
  hash = foldNumber(hash, reports.length);
  for (const report of reports) hash = foldReportPreview(hash, report);
  hash = foldNumber(hash, profiles.length);
  for (const profile of profiles) hash = foldContributorProfile(hash, profile);
  return (hash >>> 0).toString(36);
}
