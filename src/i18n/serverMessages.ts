import "server-only";
import nl from "@content/i18n/messages/nl.json";
import cs from "@content/i18n/messages/cs.json";
import de from "@content/i18n/messages/de.json";
import es from "@content/i18n/messages/es.json";
import fr from "@content/i18n/messages/fr.json";
import pl from "@content/i18n/messages/pl.json";
import pt from "@content/i18n/messages/pt.json";
import ar from "@content/i18n/messages/ar.json";
import hi from "@content/i18n/messages/hi.json";
import ja from "@content/i18n/messages/ja.json";
import ko from "@content/i18n/messages/ko.json";
import ru from "@content/i18n/messages/ru.json";
import zhHans from "@content/i18n/messages/zh-Hans.json";
import { formatMessage, type MessageValues } from "./messages";
import glossarySeeds from "./glossaryMessageSeeds.json";
import { resolveUiMessage, uiMessageId } from "./uiMessageDefinitions";
import { UI_MESSAGE_SEEDS } from "./uiMessageSeeds";

function withLocaleSeeds(locale: string, catalog: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return { ...UI_MESSAGE_SEEDS[locale], ...catalog };
}

const UI_CATALOGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "zh-Hans": withLocaleSeeds("zh-Hans", zhHans),
  ru: withLocaleSeeds("ru", ru),
  nl: withLocaleSeeds("nl", nl),
  cs: withLocaleSeeds("cs", cs),
  de: withLocaleSeeds("de", de),
  es: withLocaleSeeds("es", es),
  fr: withLocaleSeeds("fr", fr),
  pl: withLocaleSeeds("pl", pl),
  pt: withLocaleSeeds("pt", pt),
  ar: withLocaleSeeds("ar", ar),
  hi: withLocaleSeeds("hi", hi),
  ja: withLocaleSeeds("ja", ja),
  ko: withLocaleSeeds("ko", ko),
};

function uiCatalogFor(locale: string): Readonly<Record<string, string>> | undefined {
  return Object.prototype.hasOwnProperty.call(UI_CATALOGS, locale) ? UI_CATALOGS[locale] : undefined;
}

export function translateMessage(locale: string, text: string, values?: MessageValues): string {
  return formatMessage(resolveUiMessage(uiCatalogFor(locale), text), values);
}

export function glossaryUiCatalogFor(locale: string): Readonly<Record<string, string>> {
  const keys = glossarySeeds[locale as keyof typeof glossarySeeds];
  if (!keys) return {};
  const catalog = uiCatalogFor(locale);
  return Object.fromEntries(Object.keys(keys).map((key) => [uiMessageId(key), resolveUiMessage(catalog, key)]));
}
