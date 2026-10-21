
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

