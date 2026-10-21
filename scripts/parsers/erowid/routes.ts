const EROWID_ROUTE_NAMES: Record<string, string> = {
  oral: "Oral",
  insufflated: "Insufflated",
  nasal: "Insufflated",
  smoked: "Smoked",
  vapourised: "Smoked",
  vaporized: "Smoked",
  im: "Intramuscular",
  intramuscular: "Intramuscular",
  iv: "Intravenous",
  intravenous: "Intravenous",
  sublingual: "Sublingual",
  buccal: "Buccal",
  rectal: "Rectal",
  plugged: "Rectal",
  transdermal: "Transdermal",
};

export function normalizeErowidRouteName(route: string): string {
  return EROWID_ROUTE_NAMES[route.toLowerCase().trim()] || route;
}
