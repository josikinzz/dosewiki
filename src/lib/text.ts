export function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function toInitials(value: string): string {
  const parts = value
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .slice(0, 2);

  const initials = parts
    .map((segment) => segment.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .filter(Boolean)
    .join("");
  if (initials) return initials.toUpperCase();

  return Array.from(value)
    .filter((character) => /[\p{L}\p{N}]/u.test(character))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
