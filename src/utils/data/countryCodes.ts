/**
 * Country name to ISO 3166-1 alpha-2 code mapping for flags.
 * Used by both LegalitySection (article display) and legality form (dev tools).
 */

export const COUNTRY_CODES: Record<string, string> = {
  "United States": "us",
  "United Kingdom": "gb",
  "Germany": "de",
  "France": "fr",
  "Australia": "au",
  "Canada": "ca",
  "Netherlands": "nl",
  "Switzerland": "ch",
  "Austria": "at",
  "Belgium": "be",
  "Spain": "es",
  "Italy": "it",
  "Japan": "jp",
  "New Zealand": "nz",
  "Sweden": "se",
  "Norway": "no",
  "Denmark": "dk",
  "Finland": "fi",
  "Poland": "pl",
  "Portugal": "pt",
  "Brazil": "br",
  "Mexico": "mx",
  "Russia": "ru",
  "Chile": "cl",
  "China": "cn",
  "Colombia": "co",
  "India": "in",
  "South Africa": "za",
  "Argentina": "ar",
  "Bahamas": "bs",
  "Bangladesh": "bd",
  "Bulgaria": "bg",
  "Croatia": "hr",
  "Cyprus": "cy",
  "Czech Republic": "cz",
  "Djibouti": "dj",
  "Egypt": "eg",
  "Estonia": "ee",
  "Ethiopia": "et",
  "European Union": "european_union",
  "Greece": "gr",
  "Hong Kong": "hk",
  "Hungary": "hu",
  "Iceland": "is",
  "Indonesia": "id",
  "Ireland": "ie",
  "Israel": "il",
  "Kenya": "ke",
  "Latvia": "lv",
  "Lithuania": "lt",
  "Luxembourg": "lu",
  "Malaysia": "my",
  "Morocco": "ma",
  "Moldova": "md",
  "Nigeria": "ng",
  "Peru": "pe",
  "Philippines": "ph",
  "Romania": "ro",
  "Saudi Arabia": "sa",
  "Serbia": "rs",
  "Singapore": "sg",
  "Slovakia": "sk",
  "Slovenia": "si",
  "Somalia": "so",
  "South Korea": "kr",
  "Taiwan": "tw",
  "Thailand": "th",
  "Turkey": "tr",
  "Uganda": "ug",
  "Ukraine": "ua",
  "United Arab Emirates": "ae",
  "Vietnam": "vn",
  "Yemen": "ye",
  "Zambia": "zm",
};

/**
 * Get the ISO country code for a country name.
 * Handles special cases like US states and Australian territories.
 */
export function getCountryCode(name: string): string | null {
  // Direct lookup
  if (COUNTRY_CODES[name]) return COUNTRY_CODES[name];

  // Handle US states (e.g., "United States - Arizona")
  if (name.startsWith("United States - ")) return "us";

  // Handle Tasmania
  if (name.includes("Tasmania")) return "au";

  return null;
}

/**
 * Get all country names sorted alphabetically.
 * Useful for autocomplete/dropdown.
 */
export function getAllCountryNames(): string[] {
  return Object.keys(COUNTRY_CODES).sort();
}
