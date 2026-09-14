/**
 * Structured data utilities for SEO.
 *
 * Generates JSON-LD schema.org markup for substance articles.
 * Uses Article and Drug types for rich search results and answer-engine parsing.
 */

import type { SubstanceArticle } from "../../schema";
import type { Reference } from "../../schema/substance/shared";
import type { SubjectiveEffectArticle } from "../../features/effects/articleSectionModel";
import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "../../config/siteFlavor";
import { stripCitationTokens } from "../../lib/citations/citationTokens";
import { hasKnownCreator } from "../../features/effects/components/replicationCredit";
import { getReferenceDisplayTitle } from "../../lib/citations/referenceModel";

/**
 * Schema.org Article type for substance profiles.
 */
interface ArticleSchema {
  "@context": "https://schema.org";
  "@type": "Article";
  "@id": string;
  url: string;
  headline: string;
  name: string;
  alternateName?: string[];
  description: string;
  mainEntityOfPage: {
    "@type": "WebPage";
    "@id": string;
  };
  about: DrugSchema | DefinedTermSchema;
  citation?: CitationSchema[];
  keywords?: string[];
  inLanguage: string;
  isAccessibleForFree: boolean;
  dateModified?: string;
  author: {
    "@type": "Organization";
    name: string;
    url: string;
  };
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

interface DefinedTermSchema {
  "@type": "DefinedTerm";
  name: string;
  description?: string;
  inDefinedTermSet: {
    "@type": "DefinedTermSet";
    name: string;
    url: string;
  };
}

interface CitationSchema {
  "@type": "CreativeWork";
  name: string;
  url?: string;
  author?: {
    "@type": "Person";
    name: string;
  }[];
  datePublished?: string;
  publisher?: {
    "@type": "Organization";
    name: string;
  };
  identifier?: string[];
  isAccessibleForFree?: boolean;
}

interface ItemListEntry {
  name: string;
  url: string;
}

interface ItemListSchema {
  "@context": "https://schema.org";
  "@type": "ItemList";
  "@id": string;
  name: string;
  description?: string;
  url: string;
  numberOfItems: number;
  mainEntityOfPage: {
    "@type": "WebPage";
    "@id": string;
  };
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    url: string;
  }>;
}

/**
 * Schema.org ImageObject / VideoObject for a single replication permalink.
 *
 * `license` + `acquireLicensePage` + `creditText` + `creator` are the quartet
 * search engines read to mark an image as licensable — which is the reason the
 * permalink exists, so they are emitted only when a real licence is recorded
 * rather than defaulted to something permissive.
 */
interface MediaObjectSchema {
  "@context": "https://schema.org";
  "@type": "ImageObject" | "VideoObject" | "AudioObject";
  "@id": string;
  url: string;
  name: string;
  description?: string;
  contentUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  encodingFormat?: string;
  duration?: string;
  uploadDate?: string;
  creditText?: string;
  copyrightNotice?: string;
  license?: string;
  acquireLicensePage?: string;
  creator?: {
    "@type": "Person";
    name: string;
    url?: string;
  };
  mainEntityOfPage: {
    "@type": "WebPage";
    "@id": string;
  };
  isPartOf?: {
    "@type": "WebSite";
    name: string;
    url: string;
  };
}

type JsonLdSchema = ArticleSchema | ItemListSchema | MediaObjectSchema;

/**
 * Article prose reaches this file with inline `[cite:reference-id]` tokens
 * still in it — those are a rendering instruction for `CitedText`, never
 * content. Structured data has no marker to render them into, so every text
 * field goes through the shared stripper before it ships to crawlers.
 */
function cleanText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return stripCitationTokens(value) || undefined;
}

function getSchemaSiteUrl(url: string, config: SiteFlavorConfig): string {
  try {
    return new URL(url).origin;
  } catch {
    return config.launchSiteUrl;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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
  const summary = cleanText(article.summary);
  if (summary) {
    return summary;
  }

  return parts.length > 1
    ? parts.join(" ")
    : `Dosage, effects, and safety information for ${name}.`;
}

function referenceIdentifier(reference: Reference): string[] | undefined {
  const identifiers = unique([
    reference.doi ? `doi:${reference.doi}` : "",
    reference.pmid ? `pmid:${reference.pmid}` : "",
    reference.isbn ? `isbn:${reference.isbn}` : "",
  ]);

  return identifiers.length > 0 ? identifiers : undefined;
}

function referenceDate(reference: Reference): string | undefined {
  const date = cleanText(reference.date);

  if (date) {
    return date;
  }

  return reference.year ? String(reference.year) : undefined;
}

function referencePublisher(reference: Reference): CitationSchema["publisher"] | undefined {
  const name = cleanText(reference.publisher) ?? cleanText(reference.siteName) ?? cleanText(reference.containerTitle);

  return name
    ? {
        "@type": "Organization",
        name,
      }
    : undefined;
}

function buildCitationSchema(reference: Reference): CitationSchema | null {
  const name = getReferenceDisplayTitle(reference);

  if (!name) {
    return null;
  }

  const url = cleanText(reference.url) ?? cleanText(reference.archiveUrl);

  return {
    "@type": "CreativeWork",
    name,
    url,
    author:
      reference.authors?.length > 0
        ? reference.authors.flatMap((author) => {
            const name = cleanText(author);
            return name ? [{ "@type": "Person" as const, name }] : [];
          })
        : undefined,
    datePublished: referenceDate(reference),
    publisher: referencePublisher(reference),
    identifier: referenceIdentifier(reference),
    isAccessibleForFree: reference.access === "open" ? true : undefined,
  };
}

function buildCitationSchemas(article: SubstanceArticle): CitationSchema[] | undefined {
  const citations = (article.references ?? [])
    .flatMap((reference) => {
      const citation = buildCitationSchema(reference);
      return citation ? [citation] : [];
    })
    .slice(0, 25);

  return citations.length > 0 ? citations : undefined;
}

function buildEffectCitationSchemas(effect: SubjectiveEffectArticle): CitationSchema[] | undefined {
  const citations = (effect.citations ?? [])
    .flatMap((citation) => {
      const name = cleanText(citation.text) ?? cleanText(citation.from);
      const url = cleanText(citation.url);

      if (!name && !url) {
        return [];
      }

      return [
        {
          "@type": "CreativeWork" as const,
          name: name ?? url,
          url,
          publisher: citation.from
            ? {
                "@type": "Organization" as const,
                name: citation.from,
              }
            : undefined,
        },
      ];
    })
    .slice(0, 25);

  return citations.length > 0 ? citations : undefined;
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
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): ArticleSchema {
  const pageUrl = url ?? config.launchSiteUrl;
  const name = article.identification?.common_name || article.title;
  const alternateNames = unique(article.identification?.alternative_names ?? []);
  const siteUrl = getSchemaSiteUrl(pageUrl, config);

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
    alternateName: alternateNames.length > 0 ? alternateNames : undefined,
    description: cleanText(article.summary),
    drugClass: article.classification?.psychoactive_class,
    mechanismOfAction: article.pharmacology.binding_sites
      .flatMap((entry) => {
        const tag = cleanText(entry.tag);
        return tag ? [tag] : [];
      })
      .join("; ") || undefined,
  };

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${pageUrl}#article`,
    url: pageUrl,
    headline: `${name} dosage, duration, effects, interactions, and safety information`,
    name,
    alternateName: alternateNames.length > 0 ? alternateNames : undefined,
    description,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageUrl,
    },
    about: drugSchema,
    citation: buildCitationSchemas(article),
    keywords: unique(keywords).length > 0 ? unique(keywords) : undefined,
    inLanguage: "en-US",
    isAccessibleForFree: true,
    author: {
      "@type": "Organization",
      name: config.organization.contributorsName,
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: config.organization.publisherName,
      url: siteUrl,
    },
  };
}

export function buildSubjectiveEffectSchema(
  effect: SubjectiveEffectArticle,
  url?: string,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): ArticleSchema {
  const pageUrl = url ?? new URL("/effects", config.launchSiteUrl).toString();
  const description = cleanText(effect.summary) ?? `${effect.name} subjective effect entry in ${config.name}.`;
  const keywords = unique(effect.tags ?? []);
  const siteUrl = getSchemaSiteUrl(pageUrl, config);
  const effectsIndexUrl = new URL("/effects", siteUrl).toString();

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${pageUrl}#article`,
    url: pageUrl,
    headline: `${effect.name} subjective effect description, related substances, and references`,
    name: effect.name,
    description,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageUrl,
    },
    about: {
      "@type": "DefinedTerm",
      name: effect.name,
      description,
      inDefinedTermSet: {
        "@type": "DefinedTermSet",
        name: config.organization.subjectiveEffectIndexName,
        url: effectsIndexUrl,
      },
    },
    citation: buildEffectCitationSchemas(effect),
    keywords: keywords.length > 0 ? keywords : undefined,
    inLanguage: "en-US",
    isAccessibleForFree: true,
    author: {
      "@type": "Organization",
      name: config.organization.contributorsName,
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: config.organization.publisherName,
      url: siteUrl,
    },
  };
}

export function buildItemListSchema(input: {
  url: string;
  name: string;
  description?: string;
  items: ItemListEntry[];
  idSuffix?: string;
}): ItemListSchema {
  const items = input.items.filter((item) => cleanText(item.name) && cleanText(item.url));

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${input.url}#${input.idSuffix ?? "item-list"}`,
    name: input.name,
    description: cleanText(input.description),
    url: input.url,
    numberOfItems: items.length,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": input.url,
    },
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

export interface ReplicationSchemaInput {
  slug: string;
  title: string;
  type: "image" | "video" | "audio";
  contentUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  format?: string;
  durationSeconds?: number;
  createdAt?: string;
  artist?: string;
  artistUrl?: string;
  creditLine?: string;
  rightsholder?: string;
  licenseName?: string;
  licenseUrl?: string;
  effectName?: string | null;
}

export function buildReplicationSchema(
  input: ReplicationSchemaInput,
  url: string,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): MediaObjectSchema {
  const siteUrl = getSchemaSiteUrl(url, config);
  const creator = cleanText(input.artist);
  // `hasKnownCreator` folds the unattributed markers ("Unknown", "Anonymous"),
  // so the JSON-LD never asserts a Person that the page itself refuses to name.
  const hasNamedCreator = hasKnownCreator(creator);

  return {
    "@context": "https://schema.org",
    "@type":
      input.type === "video"
        ? "VideoObject"
        : input.type === "audio"
          ? "AudioObject"
          : "ImageObject",
    "@id": `${url}#media`,
    url,
    name: input.title,
    description: cleanText(
      input.effectName
        ? `A replication of the subjective effect ${input.effectName}.`
        : undefined,
    ),
    contentUrl: input.contentUrl,
    thumbnailUrl: input.thumbnailUrl,
    width: input.width,
    height: input.height,
    encodingFormat: input.format ? input.format.toLowerCase() : undefined,
    // ISO 8601 duration; schema.org expects the period form, not raw seconds.
    duration: input.durationSeconds
      ? `PT${Math.round(input.durationSeconds)}S`
      : undefined,
    uploadDate: input.createdAt,
    creditText: cleanText(input.creditLine),
    copyrightNotice: cleanText(input.rightsholder ?? (hasNamedCreator ? creator : undefined)),
    // Absent when no explicit licence is recorded — omitting the field says
    // "terms unstated", whereas guessing one would assert a permission we do
    // not have.
    license: input.licenseUrl ?? undefined,
    acquireLicensePage: input.licenseUrl ? url : undefined,
    creator: hasNamedCreator
      ? { "@type": "Person", name: creator as string, url: input.artistUrl }
      : undefined,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    isPartOf: {
      "@type": "WebSite",
      name: config.name,
      url: siteUrl,
    },
  };
}

/**
 * Serialize JSON-LD schema to a script tag string.
 */
export function serializeJsonLd(schema: JsonLdSchema): string {
  return JSON.stringify(schema)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

