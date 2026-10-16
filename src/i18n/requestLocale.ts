import { cache } from "react";
import type { MessageValues, UiLocale } from "./messages";
import { translateMessage } from "./serverMessages";

const localeBox = cache((): { locale: UiLocale } => ({ locale: "en" }));

export function setRequestLocale(locale: UiLocale): void {
  localeBox().locale = locale;
}

export function getRequestLocale(): UiLocale {
  return localeBox().locale;
}

export function t(text: string, values?: MessageValues): string {
  return translateMessage(getRequestLocale(), text, values);
}
