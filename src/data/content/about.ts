import aboutContentSource from "@content/about/about.md?raw";
import aboutSubtitleSource from "@content/about/subtitle.md?raw";
import aboutConfigSource from "@content/about/config.json";

/**
 * Shape persisted in content/about/config.json.
 *  - founderProfileKeys: array of profile keys (uppercase strings) to surface as founders.
 */
type AboutConfig = {
  founderProfileKeys: string[];
}

const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

const sanitizeMarkdown = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\r\n/g, "\n").trim();
};

const sanitizeFounderKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const next: string[] = [];
  const seen = new Set<string>();

  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }

    const normalized = entry.trim().toUpperCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    next.push(normalized);
  });

  return next;
};

const normalizeConfig = (value: unknown): AboutConfig => {
  if (!value || typeof value !== "object") {
    return { founderProfileKeys: [] } satisfies AboutConfig;
  }

  const rawKeys = (value as { founderProfileKeys?: unknown }).founderProfileKeys;

  return {
    founderProfileKeys: sanitizeFounderKeys(rawKeys),
  } satisfies AboutConfig;
};

export const aboutMarkdown = sanitizeMarkdown(aboutContentSource);
const aboutSubtitleMarkdown = sanitizeMarkdown(aboutSubtitleSource)
export const aboutConfig = normalizeConfig(aboutConfigSource);
export const aboutFounderKeys = aboutConfig.founderProfileKeys;

type AboutPlaceholderValues = Record<string, string | number | undefined>

const applyPlaceholders = (markdown: string, values: unknown): string => {
  if (!markdown) {
    return "";
  }

  if (!values || typeof values !== "object") {
    return markdown;
  }

  const lookup = new Map<string, string>();

  Object.entries(values as Record<string, unknown>).forEach(([key, entry]) => {
    if (entry === undefined || entry === null) {
      return;
    }
    lookup.set(key, String(entry));
  });

  return markdown.replace(PLACEHOLDER_PATTERN, (match, key) => {
    const replacement = lookup.get(key);
    return replacement ?? match;
  });
};


export const resolveAboutSubtitle = (values: AboutPlaceholderValues): string =>
  applyPlaceholders(aboutSubtitleMarkdown, values);

export const normalizeFounderKeys = sanitizeFounderKeys;

// Export applyPlaceholders for use with Postgres content
export { applyPlaceholders };
