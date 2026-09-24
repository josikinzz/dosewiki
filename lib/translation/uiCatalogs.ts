import "server-only";
import zhCatalog from "../../content/i18n/messages/zh-Hans.json";
import ruCatalog from "../../content/i18n/messages/ru.json";
import publications from "../../src/i18n/catalogPublication.json";
import { readPendingRefresh, type UiCatalogPublication } from "./uiCatalogPublication";

/** Compiled snapshots for all currently served UI locales. */
export function getCompiledUiCatalog(locale: string): Readonly<Record<string, string>> {
  return locale === "zh-Hans" ? zhCatalog : locale === "ru" ? ruCatalog : {};
}

const pendingRefreshByLocale = new Map<string, ReturnType<typeof readPendingRefresh>>();

/** Catalog entries the last compile left waiting for a glossary refresh, keyed by catalog key. */
export function getUiCatalogPendingRefresh(locale: string): ReturnType<typeof readPendingRefresh> {
  let pending = pendingRefreshByLocale.get(locale);
  if (!pending) {
    pending = readPendingRefresh((publications as Record<string, UiCatalogPublication>)[locale]);
    pendingRefreshByLocale.set(locale, pending);
  }
  return pending;
}
