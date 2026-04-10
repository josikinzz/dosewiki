export function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function toInitials(value: string): string {
  const parts = value
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .slice(0, 2);

  if (parts.length === 0) {
    return value.slice(0, 2).toUpperCase();
  }

  return parts
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("");
}
