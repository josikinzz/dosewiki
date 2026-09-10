import type { SubstanceArticle } from "../../src/schema";
import { normalizePharmacologySection } from "../../lib/article/normalization.mjs";
import {
  resolveSubstanceSlug,
  type SubstanceArticleRecord,
} from "../../src/data/projections/substanceProjectionCore";

/**
 * The tag-registry row: exactly what `buildTagRegistry` reads, and nothing
 * else. Identity (`id`, `title`, `identification`) feeds slug derivation and
 * the detail panel's article refs; `index_categories`, `classification`, and
 * the full `binding_sites` list (affinity included) are the tag fields the
 * registry indexes. No prose, references, or review state cross the wire, so
 * the tag editor no longer has to drain whole articles to list tags.
 */
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
  // Normalize like the sibling projections so legacy mechanism fields surface
  // as binding-site tags exactly the way the editor's client-side read does.
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
