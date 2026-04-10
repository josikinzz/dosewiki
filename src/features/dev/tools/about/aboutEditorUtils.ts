const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export function resolveAboutPlaceholders(
  value: string,
  placeholderValues: Record<string, string>,
): string {
  if (!value) {
    return "";
  }

  return value.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    const normalizedKey = key.trim();
    return placeholderValues[normalizedKey] ?? match;
  });
}

export function resizeTextareaToContent(
  element: HTMLTextAreaElement | null,
  minHeight: number,
): void {
  if (!element) {
    return;
  }

  element.style.height = "auto";
  const nextHeight = Math.max(element.scrollHeight, minHeight);
  element.style.height = `${nextHeight}px`;
}
