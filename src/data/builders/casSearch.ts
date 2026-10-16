const normalizeCasFormatting = (value: string): string => value.trim()
  .replace(/[\u2010-\u2013\u2212\uFE63\uFF0D]/g, "-")
  .replace(/\s*-\s*/g, "-");

export function isCasSearchQuery(value: string): boolean {
  const normalized = normalizeCasFormatting(value);
  return (/^[\d\s-]+$/.test(normalized) && normalized.includes("-")) || /^\d{5,10}$/.test(normalized);
}

export function normalizeCasNumber(value: string | undefined | null): string | null {
  const normalized = normalizeCasFormatting(value ?? "");
  if (!/^\d{2,7}-\d{2}-\d$/.test(normalized)) return null;

  const digits = normalized.replace(/-/g, "");
  let checksum = 0;
  for (let index = digits.length - 2, weight = 1; index >= 0; index -= 1, weight += 1) {
    checksum += Number(digits[index]) * weight;
  }
  return checksum % 10 === Number(digits[digits.length - 1]) ? normalized : null;
}
