/**
 * UI copy for the locale mirrors.
 *
 * Messages are keyed by their English source text: the English literal in the
 * component is the key, and `src/i18n/messages/<locale>.json` maps it to the
 * machine translation. `scripts/translation/ui-catalog.mjs` scans every
 * `t("...")` and `msg("...")` literal, translates the missing ones with the
 * same model and prompt as the article segments, and rewrites the catalog. A
 * key with no entry renders its English, so a freshly added string is never
 * blank on the mirror.
 *
 * `{{name}}` placeholders (the pipeline's own token syntax, which its validator
 * guards) are substituted after lookup so the translated sentence can move them.
 */
import { localeForPathPrefix } from "@server/next/localeHostPolicy";
import zhHans from "./messages/zh-Hans.json";

export type UiLocale = "en" | "zh-Hans";

export const UI_LOCALES: readonly UiLocale[] = ["en", "zh-Hans"];

const CATALOGS: Readonly<Record<UiLocale, Readonly<Record<string, string>>>> = {
  en: {},
  "zh-Hans": zhHans,
};

export type MessageValues = Readonly<Record<string, string | number>>;

/** The `t` a pure helper receives when it builds reader-visible text. */
export type Translate = (text: string, values?: MessageValues) => string;

export function formatMessage(template: string, values?: MessageValues): string {
  if (!values) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function translateMessage(locale: UiLocale, text: string, values?: MessageValues): string {
  const catalog = CATALOGS[locale];
  return formatMessage(catalog[text] ?? text, values);
}

/**
 * Marks an English literal that reaches the reader through a lookup table
 * rather than a direct `t()` call, so the catalog builder still finds it.
 * Wrap the stored value at render time with `t(...)`.
 */
export function msg<T extends string>(text: T): T {
  return text;
}

/** Locale of an app-router pathname: the mirror route prefix, else English. */
export function localeForPathname(pathname: string | null | undefined): UiLocale {
  return pathname ? (localeForPathPrefix(pathname)?.code ?? "en") : "en";
}
