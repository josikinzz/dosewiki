const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states": "United States",
  "united states of america": "United States",
  america: "United States",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  "united kingdom": "United Kingdom",
  gb: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  de: "Germany",
  germany: "Germany",
  deutschland: "Germany",
  fr: "France",
  france: "France",
  ca: "Canada",
  canada: "Canada",
  au: "Australia",
  australia: "Australia",
  nl: "Netherlands",
  netherlands: "Netherlands",
  "the netherlands": "Netherlands",
  holland: "Netherlands",
  ch: "Switzerland",
  switzerland: "Switzerland",
  schweiz: "Switzerland",
  suisse: "Switzerland",
  it: "Italy",
  italy: "Italy",
  italia: "Italy",
  es: "Spain",
  spain: "Spain",
  espana: "Spain",
  "españa": "Spain",
  br: "Brazil",
  brazil: "Brazil",
  brasil: "Brazil",
  se: "Sweden",
  sweden: "Sweden",
  sverige: "Sweden",
  no: "Norway",
  norway: "Norway",
  norge: "Norway",
  dk: "Denmark",
  denmark: "Denmark",
  danmark: "Denmark",
  at: "Austria",
  austria: "Austria",
  "österreich": "Austria",
  osterreich: "Austria",
  be: "Belgium",
  belgium: "Belgium",
  belgique: "Belgium",
  belgie: "Belgium",
  pl: "Poland",
  poland: "Poland",
  polska: "Poland",
  cz: "Czech Republic",
  "czech republic": "Czech Republic",
  czechia: "Czech Republic",
  ru: "Russia",
  russia: "Russia",
  "russian federation": "Russia",
  jp: "Japan",
  japan: "Japan",
  cn: "China",
  china: "China",
  nz: "New Zealand",
  "new zealand": "New Zealand",
  pt: "Portugal",
  portugal: "Portugal",
  ie: "Ireland",
  ireland: "Ireland",
  fi: "Finland",
  finland: "Finland",
  hu: "Hungary",
  hungary: "Hungary",
  il: "Israel",
  israel: "Israel",
  za: "South Africa",
  "south africa": "South Africa",
  mx: "Mexico",
  mexico: "Mexico",
  ar: "Argentina",
  argentina: "Argentina",
  in: "India",
  india: "India",
  sg: "Singapore",
  singapore: "Singapore",
  lv: "Latvia",
  latvia: "Latvia",
  ro: "Romania",
  romania: "Romania",
  sk: "Slovakia",
  slovakia: "Slovakia",
  si: "Slovenia",
  slovenia: "Slovenia",
  hr: "Croatia",
  croatia: "Croatia",
  ee: "Estonia",
  estonia: "Estonia",
  lt: "Lithuania",
  lithuania: "Lithuania",
  gr: "Greece",
  greece: "Greece",
  tr: "Turkey",
  turkey: "Turkey",
  th: "Thailand",
  thailand: "Thailand",
  kr: "South Korea",
  "south korea": "South Korea",
  korea: "South Korea",
  tw: "Taiwan",
  taiwan: "Taiwan",
  hk: "Hong Kong",
  "hong kong": "Hong Kong",
  my: "Malaysia",
  malaysia: "Malaysia",
  id: "Indonesia",
  indonesia: "Indonesia",
  ph: "Philippines",
  philippines: "Philippines",
  vn: "Vietnam",
  vietnam: "Vietnam",
  co: "Colombia",
  colombia: "Colombia",
  cl: "Chile",
  chile: "Chile",
  pe: "Peru",
  peru: "Peru",
  ec: "Ecuador",
  ecuador: "Ecuador",
  uy: "Uruguay",
  uruguay: "Uruguay",
};

function cleanCitationNeeded(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*\[?citation needed\]?\s*/gi, " ")
    .replace(/\s*\[?\[citation needed\]\]?\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeCountry(country: string): string {
  const lower = country.toLowerCase().trim();
  return COUNTRY_ALIASES[lower] || country;
}

export function extractStatusAndNotes(fullText: string): { status: string; notes: string } {
  if (!fullText || fullText.trim() === "") {
    return { status: "", notes: "" };
  }

  const text = cleanCitationNeeded(fullText.trim());
  const classificationPatterns = [
    /^(Schedule\s+[IVX0-9]+)/i,
    /^(Class\s+[A-C])/i,
    /^(Anlage\s+[IVX0-9]+)/i,
    /^(List\s+[IVX0-9]+)/i,
    /^(Tabella\s+[IVX0-9]+)/i,
    /^(Förteckning\s+[IVX0-9]+)/i,
    /^(Category\s+[A-Z0-9]+)/i,
    /^(Controlled)/i,
    /^(Prohibited)/i,
    /^(Illegal)/i,
    /^(Legal)/i,
    /^(Uncontrolled)/i,
    /^(Decriminalized)/i,
    /^(Not scheduled)/i,
  ];

  for (const pattern of classificationPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        status: match[1],
        notes: text.slice(match[0].length).replace(/^[\s,\-–:]+/, "").trim(),
      };
    }
  }

  if (text.length < 80) {
    return { status: text, notes: "" };
  }

  const sentenceEnd = text.search(/[.!?](?:\s|$)/);
  if (sentenceEnd > 0) {
    return {
      status: text.slice(0, sentenceEnd + 1).trim(),
      notes: text.slice(sentenceEnd + 1).trim(),
    };
  }

  return { status: text, notes: "" };
}
