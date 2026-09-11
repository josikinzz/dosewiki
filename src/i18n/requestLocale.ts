import { cache } from "react";
import { translateMessage, type MessageValues, type UiLocale } from "./messages";

/**
 * The request's UI locale for server rendering. A page sets it once at the
 * top of its render; `cache` scopes the box to the current request, so the
 * default stays English for every other route in the same process.
 *
 * This module carries no `server-only` marker because `lib/next/publicSite.ts`
 * reads the locale for page titles and is also imported by the client error
 * boundary; there the box is never set and `t` returns English.
 */
const localeBox = cache((): { locale: UiLocale } => ({ locale: "en" }));

export function setRequestLocale(locale: UiLocale): void {
  localeBox().locale = locale;
}

export function getRequestLocale(): UiLocale {
  return localeBox().locale;
}

/** Translate one English literal for the current request. */
export function t(text: string, values?: MessageValues): string {
  return translateMessage(getRequestLocale(), text, values);
}
