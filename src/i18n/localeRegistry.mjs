import registry from "../../content/i18n/localeRegistry.json" with { type: "json" };

for (const code in registry) {
  Object.freeze(registry[code].coveragePolicy);
  Object.freeze(registry[code]);
}
export const LOCALE_REGISTRY = Object.freeze(registry);

export const LOCALE_CODES = Object.freeze(Object.keys(LOCALE_REGISTRY));
export const TRANSLATION_LOCALE_CODES = Object.freeze(
  LOCALE_CODES.filter((code) => code !== "en"),
);
export const PUBLIC_LOCALES = Object.freeze(
  Object.values(LOCALE_REGISTRY).filter((locale) => locale.publicHost !== null && locale.pathPrefix),
);

export function isLocaleCode(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LOCALE_REGISTRY, value);
}

export function isPublicLocaleCode(value) {
  return typeof value === "string" && PUBLIC_LOCALES.some((locale) => locale.code === value);
}

export function resolveLocaleIdentity(code) {
  if (!isLocaleCode(code)) throw new Error(`Unknown locale ${code}. Known: ${LOCALE_CODES.join(", ")}`);
  return LOCALE_REGISTRY[code];
}
