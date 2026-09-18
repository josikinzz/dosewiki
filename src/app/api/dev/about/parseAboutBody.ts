/**
 * Request-body validation for the About page document, shared by the direct
 * save (`POST /api/dev/about`) and the proposal route, so an editor's proposal
 * is held to exactly what the admin's save is held to.
 */
import { normalizeFounderKeys } from "@/data/content/about";
import { JsonBodyError } from "@/lib/http/readJsonBody";

const MARKDOWN_MAX_LENGTH = 400_000;
const SUBTITLE_MAX_LENGTH = 2_000;
const MAX_FOUNDER_KEYS = 48;
// The stable contributor key grammar (`server/lib/contributorProfileImports`
// PROFILE_KEY) and the length ceiling `/api/dev/contributor-profile` applies.
const FOUNDER_KEY_PATTERN = /^[A-Z0-9-]+$/;
const FOUNDER_KEY_MAX_LENGTH = 200;

export type AboutBody = {
  aboutMarkdown?: unknown;
  aboutSubtitle?: unknown;
  founderProfileKeys?: unknown;
};

export type ParsedAbout = {
  aboutMarkdown: string;
  aboutSubtitle: string;
  founderProfileKeys: string[];
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

  return { aboutMarkdown, aboutSubtitle, founderProfileKeys };
}

/** The `about` entry of a proposal payload, or `null` when the payload carries none. */
export function parseAboutPayload(raw: unknown): ParsedAbout | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object") {
    throw new JsonBodyError(400, "about must be an object.");
  }
  return parseAboutBody(raw as AboutBody);
}
