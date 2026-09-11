import "server-only";
import { cache } from "react";
import { translateMessage, type MessageValues, type UiLocale } from "./messages";

/**
 * The request's UI locale for server components. A page sets it once at the
 * top of its render; `cache` scopes the box to the current request, so the
 * default stays English for every other route in the same process.
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

export { msg } from "./messages";
export type { UiLocale, Translate, MessageValues } from "./messages";
