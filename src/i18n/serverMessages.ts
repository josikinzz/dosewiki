import "server-only";
import ru from "@content/i18n/messages/ru.json";
import zhHans from "@content/i18n/messages/zh-Hans.json";
import { formatMessage, type MessageValues, type UiLocale } from "./messages";
import { resolveUiMessage } from "./uiMessageDefinitions";

/** Server callers keep the complete catalog outside shared client helpers. */
export function translateMessage(locale: UiLocale, text: string, values?: MessageValues): string {
  return formatMessage(resolveUiMessage(locale === "zh-Hans" ? zhHans : locale === "ru" ? ru : undefined, text), values);
}
