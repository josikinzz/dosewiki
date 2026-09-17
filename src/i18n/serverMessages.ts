import "server-only";

import zhHans from "@content/i18n/messages/zh-Hans.json";
import { formatMessage, type MessageValues, type UiLocale } from "./messages";

/** Server callers keep the complete catalog outside the shared client helpers. */
export function translateMessage(locale: UiLocale, text: string, values?: MessageValues): string {
  return formatMessage((locale === "zh-Hans" ? zhHans[text as keyof typeof zhHans] : undefined) ?? text, values);
}
