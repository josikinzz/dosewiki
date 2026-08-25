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
