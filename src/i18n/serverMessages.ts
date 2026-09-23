import "server-only";
import ru from "@content/i18n/messages/ru.json";
import zhHans from "@content/i18n/messages/zh-Hans.json";
import { formatMessage, type MessageValues } from "./messages";
import { resolveUiMessage } from "./uiMessageDefinitions";
import { UI_MESSAGE_SEEDS } from "./uiMessageSeeds";

/** Compiled catalog wording wins. A contextual message the checked-in catalog
 * has not caught up with yet renders the authored seed for that same locale,
 * the value the next catalog compile would carry. */
function withLocaleSeeds(locale: string, catalog: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return { ...UI_MESSAGE_SEEDS[locale], ...catalog };
}

const UI_CATALOGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "zh-Hans": withLocaleSeeds("zh-Hans", zhHans),
  ru: withLocaleSeeds("ru", ru),
};

/** The catalog of one locale; English and unknown locales have none. */
function uiCatalogFor(locale: string): Readonly<Record<string, string>> | undefined {
  return Object.prototype.hasOwnProperty.call(UI_CATALOGS, locale) ? UI_CATALOGS[locale] : undefined;
}

/** Server callers keep the complete catalog outside shared client helpers.
 * A locale without a catalog renders English, never another translation. */
export function translateMessage(locale: string, text: string, values?: MessageValues): string {
  return formatMessage(resolveUiMessage(uiCatalogFor(locale), text), values);
}
