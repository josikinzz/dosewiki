/**
 * UI copy for the locale mirrors.
 *
 * Messages are keyed by their English source text. A missing key always renders
 * its English source, so ordinary locale additions remain safe before the
 * checked-in catalog catches up.
 */
import { localeForPathPrefix } from "@server/next/localeHostPolicy";
import { LOCALE_REGISTRY } from "./localeRegistry.mjs";

export type UiLocale = "en" | "zh-Hans";

export const UI_LOCALES: readonly UiLocale[] = ["en", "zh-Hans"];


export type MessageValues = Readonly<Record<string, string | number>>;

/** The `t` a pure helper receives when it builds reader-visible text. */
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

/** Locale of an app-router pathname: the mirror route prefix, else English. */
export function localeForPathname(pathname: string | null | undefined): UiLocale {
  return pathname ? (localeForPathPrefix(pathname)?.code ?? "en") : "en";
}

/** A validated public locale query parameter, or the supplied fallback. */
export function parseUiLocale(value: string | null | undefined, fallback: UiLocale = "en"): UiLocale {
  return value === "en" || value === "zh-Hans" ? value : fallback;
}

/** Locale identity used for reader-visible dates and numbers. */
export function formattingLocale(locale: UiLocale): string {
  return LOCALE_REGISTRY[locale].formattingLocale;
}

/** Isolate an embedded identifier only when the surrounding locale is RTL. */
export function isolateLocaleIdentifier(locale: UiLocale, identifier: string): string {
  return LOCALE_REGISTRY[locale].direction === "rtl" ? `\u2068${identifier}\u2069` : identifier;
}
