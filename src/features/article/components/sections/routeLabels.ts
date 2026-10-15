import { msg } from "@/i18n/messages";

export const ROUTE_LABELS: Record<string, string> = {
  iv: msg("IV"),
  intravenous: msg("Intravenous"),
  im: msg("IM"),
  intramuscular: msg("Intramuscular"),
  "i.m.": msg("IM"),
  "iv/im": msg("IV/IM"),
};

const KNOWN_ROUTE_LABELS = [
  msg("Oral"), msg("Sublingual"), msg("Buccal"), msg("Insufflated"), msg("Smoked"), msg("Vaporized"),
  msg("Rectal"), msg("Transdermal"), msg("Subcutaneous"), msg("Inhaled"), msg("Intranasal"), msg("Injected"),
];

export const ROUTE_VOCABULARY: readonly string[] = [...KNOWN_ROUTE_LABELS, ...Object.values(ROUTE_LABELS)];
