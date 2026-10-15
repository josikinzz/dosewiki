export type InteractionTier = "dangerous" | "unsafe" | "caution";

export const INTERACTION_TIER_LABELS: Record<InteractionTier, string> = {
  dangerous: "Dangerous",
  unsafe: "Unsafe",
  caution: "Caution",
};

const TIERS: readonly InteractionTier[] = ["dangerous", "unsafe", "caution"];

export function interactionName(entry: string): string {
  return entry.split("(", 1)[0].trim();
}

export function interactionOverlaps(
  interactions: Partial<Record<InteractionTier, readonly string[] | null | undefined>> | null | undefined,
): Array<{ name: string; label: string; tiers: InteractionTier[] }> {
  const seen = new Map<string, { label: string; tiers: InteractionTier[] }>();
  for (const tier of TIERS) {
    for (const entry of interactions?.[tier] ?? []) {
      const label = interactionName(entry);
      const key = label.toLowerCase();
      if (!key) continue;
      const found = seen.get(key) ?? { label, tiers: [] };
      if (!found.tiers.includes(tier)) found.tiers.push(tier);
      seen.set(key, found);
    }
  }
  return [...seen.entries()].filter(([, value]) => value.tiers.length > 1).map(([name, value]) => ({ name, ...value }));
}
