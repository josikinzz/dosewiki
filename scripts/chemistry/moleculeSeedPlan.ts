export interface MoleculeSeedArticle {
  slug?: unknown;
  title?: unknown;
  identification?: {
    smiles?: unknown;
  } | null;
}

export interface MoleculeSeedCandidate {
  slug: string;
  title: string;
  smiles: string;
  smilesSource: "identification.smiles" | "gap-fill";
}

export interface MoleculeSeedPlan {
  candidates: MoleculeSeedCandidate[];
  summary: {
    totalArticles: number;
    withSmiles: number;
    gapFilled: number;
    missingSmiles: number;
    alreadyStored: number;
    invalidSlug: number;
    selected: number;
  };
}

const SUBSTANCE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function buildMoleculeSeedPlan(
  articles: MoleculeSeedArticle[],
  existingSlugs: Iterable<string>,
  limit = Number.POSITIVE_INFINITY,
  gapFillSmiles: ReadonlyMap<string, string> = new Map(),
): MoleculeSeedPlan {
  const existing = new Set(existingSlugs);
  const candidates: MoleculeSeedCandidate[] = [];
  let withSmiles = 0;
  let gapFilled = 0;
  let missingSmiles = 0;
  let alreadyStored = 0;
  let invalidSlug = 0;

  for (const article of articles) {
    const slugForLookup = typeof article.slug === "string" ? article.slug.trim() : "";
    const inlineSmiles =
      typeof article.identification?.smiles === "string"
        ? article.identification.smiles.trim()
        : "";
    const smiles = inlineSmiles || (gapFillSmiles.get(slugForLookup) ?? "").trim();
    if (!smiles) {
      missingSmiles += 1;
      continue;
    }
    if (inlineSmiles) withSmiles += 1;
    else gapFilled += 1;

    const slug = slugForLookup;
    if (!SUBSTANCE_SLUG_RE.test(slug)) {
      invalidSlug += 1;
      continue;
    }
    if (existing.has(slug)) {
      alreadyStored += 1;
      continue;
    }

    candidates.push({
      slug,
      title:
        typeof article.title === "string" && article.title.trim()
          ? article.title.trim()
          : slug,
      smiles,
      smilesSource: inlineSmiles ? "identification.smiles" : "gap-fill",
    });
  }

  candidates.sort((left, right) => left.slug.localeCompare(right.slug));
  const selected = candidates.slice(0, Math.max(0, limit));

  return {
    candidates: selected,
    summary: {
      totalArticles: articles.length,
      withSmiles,
      gapFilled,
      missingSmiles,
      alreadyStored,
      invalidSlug,
      selected: selected.length,
    },
  };
}
