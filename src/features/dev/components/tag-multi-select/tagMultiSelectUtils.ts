import type { TagOption } from "@/data/config/tagOptions";

export type MenuItem =
  | { type: "option"; option: TagOption }
  | { type: "create" };

export const collapseWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

export const toComparable = (value: string): string => collapseWhitespace(value).toLowerCase();

const isLowercaseOnly = (value: string): boolean =>
  /^(?:[a-z0-9\s\-_,.]+)$/u.test(value) && /[a-z]/.test(value);

export const normalizeTagLabel = (raw: string): string | null => {
  const collapsed = collapseWhitespace(raw);
  if (!collapsed) {
    return null;
  }

  if (isLowercaseOnly(collapsed)) {
    return collapsed
      .split(" ")
      .map((segment) => (segment.length > 0 ? segment[0].toUpperCase() + segment.slice(1) : segment))
      .join(" ");
  }

  return collapsed;
};

export const getSubstringPriority = (labelLower: string, queryLower: string): number => {
  if (labelLower === queryLower) {
    return 0;
  }
  if (labelLower.startsWith(queryLower)) {
    return 1;
  }
  if (labelLower.includes(queryLower)) {
    return 2;
  }
  return 3;
};
