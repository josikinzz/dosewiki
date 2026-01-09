/**
 * Structured data utilities for SEO.
 *
 * Generates JSON-LD schema.org markup for substance articles.
 * Uses Article and Drug types for rich search results.
 */

import type { SubstanceArticle } from "../../schema";

/**
 * Schema.org Article type for substance profiles.
 */
interface ArticleSchema {
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  name: string;
  alternateName?: string[];
  description: string;
  about: DrugSchema;
  keywords?: string[];
  dateModified?: string;
  publisher: {
    "@type": "Organization";
    name: string;
    url: string;
  };
}

/**
 * Schema.org Drug type embedded in article.
 */
interface DrugSchema {
  "@type": "Drug";
  name: string;
  alternateName?: string[];
  description?: string;
  drugClass?: string[];
  mechanismOfAction?: string;
}

/**
 * Generate a description from article data.
 */
function generateDescription(article: SubstanceArticle): string {
  const parts: string[] = [];

  // Add common name
  const name = article.identification?.common_name || article.title;
  parts.push(name);

  // Add psychoactive class
  const psychoactive = article.classification?.psychoactive_class;
  if (psychoactive && psychoactive.length > 0) {
    parts.push(`is a ${psychoactive.join(", ")}`);
  }

  // Add chemical class
  const chemical = article.classification?.chemical_class;
  if (chemical && chemical.length > 0) {
    parts.push(`(${chemical.join(", ")})`);
  }

  // Add summary if available
  if (article.summary) {
    return article.summary;
  }

  return parts.length > 1
    ? parts.join(" ")
    : `Dosage, effects, and safety information for ${name}.`;
}

/**
 * Build JSON-LD schema for a substance article.
 *
 * @param article The substance article data
 * @param url The canonical URL for this article
 * @returns JSON-LD object ready for serialization
 */
export function buildSubstanceSchema(
  article: SubstanceArticle,
  url?: string,
): ArticleSchema {
  const name = article.identification?.common_name || article.title;
  const alternateNames = article.identification?.alternative_names?.filter(
    (n) => n && n.trim().length > 0,
  );

  const description = generateDescription(article);

  // Build keywords from classifications
  const keywords: string[] = [];
  if (article.classification?.psychoactive_class) {
    keywords.push(...article.classification.psychoactive_class);
  }
  if (article.classification?.chemical_class) {
    keywords.push(...article.classification.chemical_class);
  }
  if (article.index_categories) {
    keywords.push(...article.index_categories);
  }

  // Build drug schema
  const drugSchema: DrugSchema = {
    "@type": "Drug",
    name,
    alternateName: alternateNames && alternateNames.length > 0 ? alternateNames : undefined,
    description: article.summary || undefined,
    drugClass: article.classification?.psychoactive_class,
    mechanismOfAction: article.pharmacology?.mechanism_of_action?.join("; "),
  };

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${name} - Dosage, Effects & Safety Information`,
    name,
    alternateName: alternateNames && alternateNames.length > 0 ? alternateNames : undefined,
    description,
    about: drugSchema,
    keywords: keywords.length > 0 ? keywords : undefined,
    publisher: {
      "@type": "Organization",
      name: "dose.wiki",
      url: "https://dose.wiki",
    },
  };
}

/**
 * Serialize JSON-LD schema to a script tag string.
 */
export function serializeJsonLd(schema: ArticleSchema): string {
  return JSON.stringify(schema, null, 0);
}

/**
 * Build a complete JSON-LD script tag for injection into HTML.
 */
export function buildJsonLdScript(article: SubstanceArticle, url?: string): string {
  const schema = buildSubstanceSchema(article, url);
  return `<script type="application/ld+json">${serializeJsonLd(schema)}</script>`;
}
