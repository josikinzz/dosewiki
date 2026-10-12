import { PUBLIC_LOCALES } from "@/i18n/localeRegistry.mjs";

/** One public address per language, including languages without a mirror host. */
export function glossaryHref(locale: string): string {
  if (locale === "en") return "/glossary";
  const mirror = PUBLIC_LOCALES.find((entry) => entry.code === locale);
  return mirror
    ? `https://${mirror.publicHost}/glossary`
    : `/glossary?locale=${encodeURIComponent(locale)}`;
}
