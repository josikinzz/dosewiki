import { normalizeFounderKeys } from "@/data/content/about";
import {
  parseTranslationCredits,
  TranslationCreditsError,
  type TranslationCredits,
} from "@/data/content/translationCredits";
import { JsonBodyError } from "@/lib/http/readJsonBody";

const MARKDOWN_MAX_LENGTH = 400_000;
const SUBTITLE_MAX_LENGTH = 2_000;
const MAX_FOUNDER_KEYS = 48;
const FOUNDER_KEY_PATTERN = /^[A-Z0-9-]+$/;
const FOUNDER_KEY_MAX_LENGTH = 200;

export type AboutBody = {
  aboutMarkdown?: unknown;
  aboutSubtitle?: unknown;
  founderProfileKeys?: unknown;
  translationCredits?: unknown;
};

export type ParsedAbout = {
  aboutMarkdown: string;
  aboutSubtitle: string;
  founderProfileKeys: string[];
  translationCredits?: TranslationCredits;
};

function requireText(raw: unknown, label: string, maxLength: number): string {
  if (typeof raw !== "string") {
    throw new JsonBodyError(400, `${label} must be a string.`);
  }
  if (raw.length > maxLength) {
    throw new JsonBodyError(400, `${label} must be ${maxLength} characters or fewer.`);
  }
  return raw;
}

export function parseAboutBody(raw: AboutBody): ParsedAbout {
  const aboutMarkdown = requireText(raw.aboutMarkdown, "The page copy", MARKDOWN_MAX_LENGTH);
  const aboutSubtitle = requireText(raw.aboutSubtitle, "The subtitle", SUBTITLE_MAX_LENGTH);

  if (!Array.isArray(raw.founderProfileKeys)) {
    throw new JsonBodyError(400, "The founder keys must be an array.");
  }
  if (raw.founderProfileKeys.length > MAX_FOUNDER_KEYS) {
    throw new JsonBodyError(400, `The founder keys may hold at most ${MAX_FOUNDER_KEYS} entries.`);
  }
  if (raw.founderProfileKeys.some((entry) => typeof entry !== "string")) {
    throw new JsonBodyError(400, "Each founder key must be a string.");
  }

  const founderProfileKeys = normalizeFounderKeys(raw.founderProfileKeys);
  const invalidKey = founderProfileKeys.find(
    (key) => key.length > FOUNDER_KEY_MAX_LENGTH || !FOUNDER_KEY_PATTERN.test(key),
  );
  if (invalidKey !== undefined) {
    throw new JsonBodyError(
      400,
      "Each founder key must be a contributor profile key: letters, digits, and hyphens only.",
    );
  }

  if (raw.translationCredits === undefined) {
    return { aboutMarkdown, aboutSubtitle, founderProfileKeys };
  }
  try {
    return { aboutMarkdown, aboutSubtitle, founderProfileKeys, translationCredits: parseTranslationCredits(raw.translationCredits) };
  } catch (error) {
    if (error instanceof TranslationCreditsError) throw new JsonBodyError(400, error.message);
    throw error;
  }
}

export function parseAboutPayload(raw: unknown): ParsedAbout | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object") {
    throw new JsonBodyError(400, "about must be an object.");
  }
  return parseAboutBody(raw as AboutBody);
}
