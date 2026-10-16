import translationLocaleNames from "@/i18n/translationLocaleNames.json";
import { publicHref } from "@/utils/publicHref";

export type TranslationCredit = { profileKey: string; contribution: string };
export type TranslationCredits = Record<string, TranslationCredit[]>;

export type PublicTranslationCredit = {
  key: string;
  displayName: string;
  avatarUrl: string | null;
  href: string;
  contribution: string;
};

export const TRANSLATION_CREDIT_LOCALES: readonly string[] = Object.keys(translationLocaleNames);
export const MAX_TRANSLATION_CREDITS_PER_LOCALE = 24;
export const TRANSLATION_CREDIT_CONTRIBUTION_MAX_LENGTH = 240;
const PROFILE_KEY_PATTERN = /^[A-Z0-9-]+$/;
const PROFILE_KEY_MAX_LENGTH = 200;

export class TranslationCreditsError extends Error {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeContribution(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readCredit(raw: unknown): TranslationCredit | string {
  if (!isPlainObject(raw)) return "Each credit must be an object with a profile key and a contribution.";
  if (typeof raw.profileKey !== "string") return "Each credit needs a contributor profile key.";
  const profileKey = raw.profileKey.trim().toUpperCase();
  if (!profileKey || profileKey.length > PROFILE_KEY_MAX_LENGTH || !PROFILE_KEY_PATTERN.test(profileKey)) {
    return "Each credit's profile key must be a contributor profile key: letters, digits, and hyphens only.";
  }
  if (typeof raw.contribution !== "string") return "Each credit needs a contribution line.";
  const contribution = normalizeContribution(raw.contribution);
  if (!contribution) return "Each credit needs a contribution line.";
  if (contribution.length > TRANSLATION_CREDIT_CONTRIBUTION_MAX_LENGTH) {
    return `A contribution line must be ${TRANSLATION_CREDIT_CONTRIBUTION_MAX_LENGTH} characters or fewer.`;
  }
  return { profileKey, contribution };
}

export function parseTranslationCredits(raw: unknown): TranslationCredits {
  if (!isPlainObject(raw)) throw new TranslationCreditsError("The translation credits must be an object keyed by language.");
  for (const locale of Object.keys(raw)) {
    if (!TRANSLATION_CREDIT_LOCALES.includes(locale)) {
      throw new TranslationCreditsError(`"${locale}" is not a translation language.`);
    }
  }
  const parsed: TranslationCredits = {};
  for (const locale of TRANSLATION_CREDIT_LOCALES) {
    if (!Object.prototype.hasOwnProperty.call(raw, locale)) continue;
    const list = raw[locale];
    if (!Array.isArray(list)) throw new TranslationCreditsError(`The ${locale} credits must be a list.`);
    if (list.length > MAX_TRANSLATION_CREDITS_PER_LOCALE) {
      throw new TranslationCreditsError(`A language may credit at most ${MAX_TRANSLATION_CREDITS_PER_LOCALE} people.`);
    }
    const credits: TranslationCredit[] = [];
    for (const entry of list) {
      const credit = readCredit(entry);
      if (typeof credit === "string") throw new TranslationCreditsError(credit);
      if (credits.some((existing) => existing.profileKey === credit.profileKey)) {
        throw new TranslationCreditsError(`${credit.profileKey} is credited more than once for ${locale}.`);
      }
      credits.push(credit);
    }
    if (credits.length) parsed[locale] = credits;
  }
  return parsed;
}

export function translationCreditsFor(stored: unknown, locale: string): TranslationCredit[] {
  if (!isPlainObject(stored) || !Array.isArray(stored[locale])) return [];
  const credits: TranslationCredit[] = [];
  for (const entry of stored[locale] as unknown[]) {
    const credit = readCredit(entry);
    if (typeof credit === "string" || credits.some((existing) => existing.profileKey === credit.profileKey)) continue;
    credits.push(credit);
    if (credits.length === MAX_TRANSLATION_CREDITS_PER_LOCALE) break;
  }
  return credits;
}

export function translationCreditHref(profile: { key: string; links: readonly { url: string; label?: string }[] }): string {
  const external = profile.links.find((link) => /^https?:\/\//i.test(link.url.trim()));
  return external ? external.url.trim() : publicHref.contributor(profile.key);
}

type CreditProfile = {
  key: string;
  displayName: string;
  avatarUrl: string | null;
  links: readonly { url: string; label?: string }[];
};

export function projectTranslationCredits(
  credits: readonly TranslationCredit[],
  profileFor: (key: string) => CreditProfile | null,
): PublicTranslationCredit[] {
  return credits.flatMap((credit) => {
    const profile = profileFor(credit.profileKey);
    if (!profile) return [];
    return [{
      key: profile.key,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      href: translationCreditHref(profile),
      contribution: credit.contribution,
    }];
  });
}
