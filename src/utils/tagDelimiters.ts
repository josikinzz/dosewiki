export interface TagTokenizerOptions {
  splitOnSemicolon?: boolean;
  splitOnComma?: boolean;
  splitOnSlash?: boolean;
  slashRequiresWhitespace?: boolean;
}

const DEFAULT_OPTIONS: Required<TagTokenizerOptions> = {
  splitOnSemicolon: true,
  splitOnComma: true,
  splitOnSlash: true,
  slashRequiresWhitespace: true,
};

const isWhitespace = (value: string): boolean => value === " " || value === "\t";

const normalizeTagEntry = (value: string | null | undefined): { key: string; label: string } | null => {
  if (!value) {
    return null;
  }

  const label = value.replace(/\s+/g, " ").trim();
  if (!label) {
    return null;
  }

  return {
    key: label.toLowerCase(),
    label,
  };
};

const normalizeTagList = (values: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const entry = normalizeTagEntry(value);
    if (!entry) {
      return;
    }

    if (seen.has(entry.key)) {
      return;
    }

    seen.add(entry.key);
    normalized.push(entry.label);
  });

  return normalized;
};

export const ensureNormalizedTagList = (values: string[]): string[] => normalizeTagList(values);

export const joinNormalizedValues = (values: string[], delimiter: string): string =>
  normalizeTagList(values).join(delimiter);

export const toTrimmedArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (typeof entry === "number" && Number.isFinite(entry)) {
          return entry.toString();
        }
        return "";
      })
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n+/g)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
};

const shouldSplitOnComma = (source: string, index: number): boolean => {
  const next = source[index + 1] ?? "";
  if (next === " " || next === "\t") {
    return true;
  }
  return false;
};

const shouldSplitOnSlash = (
  source: string,
  index: number,
  requireWhitespace: boolean,
): { split: boolean; skipCount: number } => {
  const prev = source[index - 1] ?? "";
  const next = source[index + 1] ?? "";
  const hasLeadingWhitespace = isWhitespace(prev);
  const hasTrailingWhitespace = isWhitespace(next);

  if (!hasTrailingWhitespace) {
    return { split: false, skipCount: 0 };
  }

  if (requireWhitespace && !hasLeadingWhitespace) {
    return { split: false, skipCount: 0 };
  }

  let skipCount = 0;
  let cursor = index + 1;
  while (cursor < source.length && isWhitespace(source[cursor])) {
    skipCount += 1;
    cursor += 1;
  }

  return { split: true, skipCount };
};

export const tokenizeTagString = (value: string, options: TagTokenizerOptions = {}): string[] => {
  if (typeof value !== "string") {
    return [];
  }

  const merged = { ...DEFAULT_OPTIONS, ...options };
  const normalizedSource = value.replace(/\r?\n+/g, ";");
  if (!normalizedSource.trim()) {
    return [];
  }

  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      tokens.push(trimmed);
    }
    current = "";
  };

  for (let index = 0; index < normalizedSource.length; index += 1) {
    const char = normalizedSource[index];

    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (depth === 0) {
      if (merged.splitOnSemicolon && char === ";") {
        flush();
        while (index + 1 < normalizedSource.length && normalizedSource[index + 1] === " ") {
          index += 1;
        }
        continue;
      }

      if (merged.splitOnComma && char === "," && shouldSplitOnComma(normalizedSource, index)) {
        flush();
        while (index + 1 < normalizedSource.length && normalizedSource[index + 1] === " ") {
          index += 1;
        }
        continue;
      }

      if (merged.splitOnSlash && char === "/") {
        const { split, skipCount } = shouldSplitOnSlash(
          normalizedSource,
          index,
          merged.slashRequiresWhitespace,
        );
        if (split) {
          flush();
          index += skipCount;
          continue;
        }
      }
    }

    current += char;
  }

  flush();

  return ensureNormalizedTagList(tokens);
};

export const tokenizeTagField = (
  value: unknown,
  options: TagTokenizerOptions = {},
): string[] => {
  if (Array.isArray(value)) {
    return ensureNormalizedTagList(toTrimmedArray(value));
  }

  if (typeof value === "string") {
    return tokenizeTagString(value, options);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return tokenizeTagString(String(value), options);
  }

  return [];
};
