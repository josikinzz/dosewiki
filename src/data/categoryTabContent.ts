export interface CategoryTabContent {
  definition?: string;
  warning?: string;
}

export function hasCategoryTabContent(
  content: CategoryTabContent | undefined,
): content is CategoryTabContent {
  return Boolean(content && (content.definition?.trim() || content.warning?.trim()));
}
