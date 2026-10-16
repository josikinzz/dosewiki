import type { SubstanceArticle } from "../../src/schema";
import { normalizePharmacologySection } from "../../lib/article/normalization.mjs";
import {
  resolveSubstanceSlug,
  type SubstanceArticleRecord,
} from "../../src/data/projections/substanceProjectionCore";

export type TagRegistryEntry = {
  id: SubstanceArticleRecord["id"];
  slug: string;
  title: string;
  identification: SubstanceArticle["identification"];
  index_categories: string[];
  classification: SubstanceArticle["classification"];
  pharmacology: {
    binding_sites: SubstanceArticle["pharmacology"]["binding_sites"];
  };
};

export function projectTagRegistryEntry(article: SubstanceArticleRecord): TagRegistryEntry {
  const pharmacology = normalizePharmacologySection(article.pharmacology);
  return {
    id: article.id,
    slug: resolveSubstanceSlug(article),
    title: article.title,
    identification: article.identification,
    index_categories: article.index_categories ?? [],
    classification: article.classification,
    pharmacology: { binding_sites: pharmacology.binding_sites },
  };
}
