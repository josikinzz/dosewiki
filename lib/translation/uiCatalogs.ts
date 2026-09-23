import "server-only";
import zhCatalog from "../../content/i18n/messages/zh-Hans.json";
import ruCatalog from "../../content/i18n/messages/ru.json";

/** Compiled snapshots for all currently served UI locales. */
export function getCompiledUiCatalog(locale: string): Readonly<Record<string, string>> {
  return locale === "zh-Hans" ? zhCatalog : locale === "ru" ? ruCatalog : {};
}
