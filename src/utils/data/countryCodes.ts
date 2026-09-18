/**
 * Country name to ISO 3166-1 alpha-2 code mapping for flags.
 * Used by both LegalitySection (article display) and legality form (dev tools).
 */
import { msg } from "@/i18n/messages";

const COUNTRY_CODES: Record<string, string> = {
  [msg("United States")]: "us",
  [msg("United Kingdom")]: "gb",
  [msg("Germany")]: "de",
  [msg("France")]: "fr",
  [msg("Australia")]: "au",
  [msg("Canada")]: "ca",
  [msg("Netherlands")]: "nl",
  [msg("Switzerland")]: "ch",
  [msg("Austria")]: "at",
  [msg("Belgium")]: "be",
  [msg("Spain")]: "es",
  [msg("Italy")]: "it",
  [msg("Japan")]: "jp",
  [msg("New Zealand")]: "nz",
  [msg("Sweden")]: "se",
  [msg("Norway")]: "no",
  [msg("Denmark")]: "dk",
  [msg("Finland")]: "fi",
  [msg("Poland")]: "pl",
  [msg("Portugal")]: "pt",
  [msg("Brazil")]: "br",
  [msg("Bolivia")]: "bo",
  [msg("Mexico")]: "mx",
  [msg("Russia")]: "ru",
  [msg("Chile")]: "cl",
  [msg("China")]: "cn",
  [msg("Colombia")]: "co",
  [msg("Costa Rica")]: "cr",
  [msg("India")]: "in",
  [msg("South Africa")]: "za",
  [msg("Argentina")]: "ar",
  [msg("Bahamas")]: "bs",
  [msg("Bangladesh")]: "bd",
  [msg("Belarus")]: "by",
  [msg("British Virgin Islands")]: "vg",
  [msg("Bulgaria")]: "bg",
  [msg("Croatia")]: "hr",
  [msg("Cambodia")]: "kh",
  [msg("Cyprus")]: "cy",
  [msg("Czech Republic")]: "cz",
  [msg("Djibouti")]: "dj",
  [msg("Egypt")]: "eg",
  [msg("Estonia")]: "ee",
  [msg("Ethiopia")]: "et",
  [msg("European Union")]: "european_union",
  [msg("Greece")]: "gr",
  [msg("Hong Kong")]: "hk",
  [msg("Hungary")]: "hu",
  [msg("Iceland")]: "is",
  [msg("Indonesia")]: "id",
  [msg("Iran")]: "ir",
  [msg("Ireland")]: "ie",
  [msg("Israel")]: "il",
  [msg("Kenya")]: "ke",
  [msg("Kuwait")]: "kw",
  [msg("Latvia")]: "lv",
  [msg("Laos")]: "la",
  [msg("Lithuania")]: "lt",
  [msg("Luxembourg")]: "lu",
  [msg("Malaysia")]: "my",
  [msg("Malta")]: "mt",
  [msg("Morocco")]: "ma",
  [msg("Moldova")]: "md",
  [msg("Nigeria")]: "ng",
  [msg("North Korea")]: "kp",
  [msg("Peru")]: "pe",
  [msg("Pakistan")]: "pk",
  [msg("Philippines")]: "ph",
  [msg("Romania")]: "ro",
  [msg("Saudi Arabia")]: "sa",
  [msg("Russian Federation")]: "ru",
  [msg("Rwanda")]: "rw",
  [msg("Serbia")]: "rs",
  [msg("Singapore")]: "sg",
  [msg("Slovakia")]: "sk",
  [msg("Slovak Republic")]: "sk",
  [msg("Slovenia")]: "si",
  [msg("Somalia")]: "so",
  [msg("Sri Lanka")]: "lk",
  [msg("South Korea")]: "kr",
  [msg("Taiwan")]: "tw",
  [msg("Thailand")]: "th",
  [msg("Turkey")]: "tr",
  [msg("Uganda")]: "ug",
  [msg("Ukraine")]: "ua",
  [msg("United Arab Emirates")]: "ae",
  [msg("Vietnam")]: "vn",
  [msg("Yemen")]: "ye",
  [msg("Zambia")]: "zm",
}

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

