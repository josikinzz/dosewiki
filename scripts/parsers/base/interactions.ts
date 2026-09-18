export function detectInteractionSeverity(
  text: string,
): "dangerous" | "unsafe" | "caution" | "low-risk-synergy" | "low-risk-decrease" | "low-risk-no-synergy" {
  const lower = text.toLowerCase();

  if (
    lower.includes("dangerous") ||
    lower.includes("fatal") ||
    lower.includes("life-threatening") ||
    lower.includes("serotonin syndrome") ||
    lower.includes("death")
  ) {
    return "dangerous";
  }

  if (lower.includes("unsafe") || lower.includes("avoid") || lower.includes("do not combine") || lower.includes("serious")) {
    return "unsafe";
  }

  if (lower.includes("caution") || lower.includes("care") || lower.includes("monitor") || lower.includes("reduce dose")) {
    return "caution";
  }

  if (lower.includes("synergy") || lower.includes("enhance") || lower.includes("potentiate")) {
    return "low-risk-synergy";
  }

  if (lower.includes("decrease") || lower.includes("diminish") || lower.includes("reduce effect")) {
    return "low-risk-decrease";
  }

  return "low-risk-no-synergy";
}
