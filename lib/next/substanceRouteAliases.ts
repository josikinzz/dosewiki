export const substanceRouteAliases = {
  acid: "lsd",
  "lysergic-acid-diethylamide": "lsd",
  "lsd-25": "lsd",
  ecstasy: "mdma",
  molly: "mdma",
  mandy: "mdma",
  "3-4-methylenedioxymethamphetamine": "mdma",
  "n-n-dimethyltryptamine": "dmt",
  "nn-dimethyltryptamine": "dmt",
  "n-n-dmt": "dmt",
  "special-k": "ketamine",
  psilocybin: "psilocybin-mushrooms",
  mushrooms: "psilocybin-mushrooms",
  "magic-mushrooms": "psilocybin-mushrooms",
  shrooms: "psilocybin-mushrooms",
  "2cb": "2c-b",
  dxm: "dextromethorphan",
  lean: "codeine",
  sonata: "zaleplon",
} as const satisfies Record<string, string>;

export function getSubstanceRouteAlias(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();

  return substanceRouteAliases[normalized as keyof typeof substanceRouteAliases] ?? null;
}
