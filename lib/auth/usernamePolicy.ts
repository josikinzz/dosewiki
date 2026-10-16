const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export const normalizeUsername = (input: string): string => input.trim().toLowerCase();

export function validateUsername(normalized: string): string | null {
  return USERNAME_PATTERN.test(normalized)
    ? null
    : "Usernames are 3 to 32 characters: lowercase letters, digits, underscores or dashes, starting with a letter or digit.";
}
