import { localeForPathPrefix } from "@server/next/localeHostPolicy";
import { LOCALE_REGISTRY } from "./localeRegistry.mjs";

export type UiLocale = "en" | "zh-Hans" | "ru";

export const UI_LOCALES: readonly UiLocale[] = ["en", "zh-Hans", "ru"];


export type MessageValues = Readonly<Record<string, string | number>>;

export type Translate = (text: string, values?: MessageValues) => string;

export function formatMessage(template: string, values?: MessageValues): string {
  if (!values) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}


export function msg<T extends string>(text: T): T {
  return text;
}

export function localeForPathname(pathname: string | null | undefined): UiLocale {
  return pathname ? (localeForPathPrefix(pathname)?.code ?? "en") : "en";
}

export function parseUiLocale(value: string | null | undefined, fallback: UiLocale = "en"): UiLocale {
  return value === "en" || value === "zh-Hans" || value === "ru" ? value : fallback;
}

export function formattingLocale(locale: UiLocale): string {
  return LOCALE_REGISTRY[locale].formattingLocale;
}

export function isolateLocaleIdentifier(locale: UiLocale, identifier: string): string {
  return LOCALE_REGISTRY[locale].direction === "rtl" ? `\u2068${identifier}\u2069` : identifier;
}
