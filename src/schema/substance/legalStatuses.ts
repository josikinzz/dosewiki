import { msg } from "@/i18n/messages";

/**
 * Canonical country-legality statuses, kept Zod-free so client components
 * (the article's Legality section) can deep-import the list without dragging
 * the Zod-heavy schema graph into their bundle. `shared.ts` builds the
 * `countryLegalitySchema` enum from this same array.
 */
export const CANONICAL_LEGAL_STATUSES = [
  "prohibited",
  "analog_covered",
  "precursor_controlled",
  "prescription_only",
  "decriminalized",
  "legal_regulated",
  "unscheduled",
  "restricted_other",
] as const;

export type CanonicalLegalStatus = (typeof CANONICAL_LEGAL_STATUSES)[number];

/**
 * Reader-facing label for each canonical status. The Legality section renders
 * this label whenever `canonicalStatus` is set, and legality drafts derive the
 * stored `status` display string from it so no other wording reaches production.
 */
export const CANONICAL_STATUS_LABELS: Record<CanonicalLegalStatus, string> = {
  prohibited: msg("Illegal"),
  analog_covered: msg("Illegal (analog/blanket ban)"),
  precursor_controlled: msg("Controlled precursor"),
  prescription_only: msg("Prescription only"),
  decriminalized: msg("Decriminalized"),
  legal_regulated: msg("Legal (regulated)"),
  unscheduled: msg("Not scheduled"),
  restricted_other: msg("Restricted"),
};
