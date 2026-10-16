import { msg } from "@/i18n/messages";

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
