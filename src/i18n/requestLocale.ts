import { cache } from "react";
import { translateMessage, type MessageValues, type UiLocale } from "./messages";

/** Request-local UI locale; defaults to English for every request. */
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
