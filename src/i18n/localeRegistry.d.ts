import registry from "@content/i18n/localeRegistry.json";

export type LocaleCode = keyof typeof registry;
export type TranslationLocaleCode = Exclude<LocaleCode, "en">;
export type LocaleDirection = "ltr" | "rtl";
export type LocaleCoveragePolicy = Readonly<{
  script: "latin" | "simplified-han";
  numerals: "arabic" | "arabic-or-chinese-small";
}>;

export type LocaleIdentity<Code extends LocaleCode = LocaleCode> = Readonly<{
  code: Code;
  publicHost: string | null;
  pathPrefix: string | null;
  htmlLanguage: string;
  formattingLocale: string;
  catalogIdentity: LocaleCode;
  direction: LocaleDirection;
  coveragePolicy: LocaleCoveragePolicy;
}>;

export const LOCALE_REGISTRY: Readonly<{ [Code in LocaleCode]: LocaleIdentity<Code> }>;
export const LOCALE_CODES: readonly LocaleCode[];
export const TRANSLATION_LOCALE_CODES: readonly TranslationLocaleCode[];
export const PUBLIC_LOCALES: readonly (LocaleIdentity<TranslationLocaleCode> & { publicHost: string; pathPrefix: string })[];
export function isLocaleCode(value: unknown): value is LocaleCode;
export function isPublicLocaleCode(value: unknown): value is TranslationLocaleCode;
export function resolveLocaleIdentity<Code extends LocaleCode>(code: Code): LocaleIdentity<Code>;
