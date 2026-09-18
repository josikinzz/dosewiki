import { msg } from "@/i18n/messages";

/**
 * Route-of-administration labels, kept in a plain-TypeScript module so the
 * catalog builder and the glossary drafter read the wording without importing
 * the dosage table component. Same split as `dosageDurationLabels.ts`.
 * `msg` is the identity: renderers translate a label with `t(label)`.
 */

/** Stored spellings that render as something other than their capitalized form. */
export const ROUTE_LABELS: Record<string, string> = {
  iv: msg("IV"),
  intravenous: msg("Intravenous"),
  im: msg("IM"),
  intramuscular: msg("Intramuscular"),
  "i.m.": msg("IM"),
  "iv/im": msg("IV/IM"),
};

/**
 * The routes the corpus uses, listed so the catalog builder carries them; any
 * other spelling still renders capitalized and translates if the catalog knows it.
 */
const KNOWN_ROUTE_LABELS = [
  msg("Oral"), msg("Sublingual"), msg("Buccal"), msg("Insufflated"), msg("Smoked"), msg("Vaporized"),
  msg("Rectal"), msg("Transdermal"), msg("Subcutaneous"), msg("Inhaled"), msg("Intranasal"), msg("Injected"),
];

/** Every route label a reader can meet, for the glossary drafter (which dedupes the repeated "IM"). */
export const ROUTE_VOCABULARY: readonly string[] = [...KNOWN_ROUTE_LABELS, ...Object.values(ROUTE_LABELS)];
