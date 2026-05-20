import { getCitationSortKey, isDuplicateCitation, isStandardSource } from "../citationRolePolicy.mjs";
import { transformDosage } from "../../prepopulate/dosage-duration/dosage.mjs";
import { transformDuration } from "../../prepopulate/dosage-duration/duration.mjs";
import { slugify as dosageDurationSlugify } from "../../prepopulate/dosage-duration/normalize.mjs";

export const SOURCE_DISPLAY_NAMES = {
  disregardeverythingisay: "Disregard Everything I Say",
  drugbank: "DrugBank",
  drugusersbible: "Drug Users Bible",
  erowid: "Erowid",
  isomerdesign: "Isomer Design (TiHKAL/PiHKAL)",
  psychonautwiki: "PsychonautWiki",
  saferparty: "Safer Party",
  thedrugclassroom: "The Drug Classroom",
  "tripsit-factsheets": "TripSit Factsheets",
  "tripsit-wiki": "TripSit Wiki",
  wikipedia: "Wikipedia",
};

export function slugifyArticleTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function moveStandardCitationsToSources({ article }) {
  const citations = article.citations || [];
  const sourceCitations = article.source_citations || [];

  const newSourceCitations = [...sourceCitations];
  const newCitations = [];
  let movedCount = 0;

  for (const citation of citations) {
    if (isStandardSource(citation.url)) {
      if (!isDuplicateCitation(citation, newSourceCitations)) {
        newSourceCitations.push(citation);
        movedCount += 1;
      }
    } else {
      newCitations.push(citation);
    }
  }

  newSourceCitations.sort((a, b) => getCitationSortKey(a).localeCompare(getCitationSortKey(b)));
  newCitations.sort((a, b) => getCitationSortKey(a).localeCompare(getCitationSortKey(b)));

  return {
    article: {
      ...article,
      source_citations: newSourceCitations,
      citations: newCitations,
    },
    metadata: {
      movedCount,
    },
  };
}

export function backfillSlug({ article }) {
  const slug = slugifyArticleTitle(article.title);

  if (article.slug === slug) {
    return { article, metadata: { slug } };
  }

  return {
    article: {
      ...article,
      slug,
    },
    metadata: { slug },
  };
}

export function normalizeUrlForDeduplication(url) {
  if (!url) return "";
  return String(url)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export function extractSourceUrl(content) {
  const match = String(content || "").match(/\*Source:\s*(https?:\/\/[^\s*]+)\*/);
  return match ? match[1] : null;
}

export function parseSourcesArray(sourceContent) {
  const sourcesMatch = String(sourceContent || "").match(/export const sources = (\[[\s\S]*?\]);/);
  if (!sourcesMatch) return null;
  return JSON.parse(sourcesMatch[1]);
}

export function extractSourceBodyPreview(sourceContent, sourceId, previewLength = 500) {
  const contentStartRegex = new RegExp(`"${sourceId}":\\s*\``, "m");
  const startMatch = String(sourceContent || "").match(contentStartRegex);
  if (!startMatch) return null;
  const startPos = startMatch.index + startMatch[0].length;
  return String(sourceContent).substring(startPos, startPos + previewLength);
}

export function populateSourceCitations({ article, sources }) {
  const sourceContent = sources?.articleSource;

  if (!sourceContent) {
    return { skipped: true, reason: "no source file" };
  }

  let sourcesArray;
  try {
    sourcesArray = parseSourcesArray(sourceContent);
  } catch (error) {
    return {
      skipped: true,
      reason: "failed to parse sources",
      warnings: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (!sourcesArray) {
    return { skipped: true, reason: "no sources array found" };
  }

  const newSourceCitations = [];
  const sourceUrls = new Set();
  const bySource = {};
  let drugUsersBibleCount = 0;
  let sourcesMissing = 0;

  for (const source of sourcesArray) {
    const sourceId = source.id;
    const displayName = SOURCE_DISPLAY_NAMES[sourceId] || source.displayName;
    const contentPreview = extractSourceBodyPreview(sourceContent, sourceId);

    if (!contentPreview) {
      sourcesMissing += 1;
      continue;
    }

    bySource[sourceId] = (bySource[sourceId] || 0) + 1;
    const url = extractSourceUrl(contentPreview);

    if (url) {
      newSourceCitations.push({ name: displayName, url });
      sourceUrls.add(normalizeUrlForDeduplication(url));
    } else if (sourceId === "drugusersbible") {
      newSourceCitations.push({
        name: "Drug Users Bible by Dominic Milton Trott",
        url: "",
      });
      drugUsersBibleCount += 1;
    }
  }

  if (newSourceCitations.length === 0) {
    return {
      skipped: true,
      reason: "no source URLs extracted",
      metadata: { sourcesMissing, bySource, drugUsersBibleCount },
    };
  }

  let citationsDeduplicated = 0;
  const citations = (article.citations || []).filter((citation) => {
    const citationUrl = normalizeUrlForDeduplication(citation.url);
    if (citationUrl && sourceUrls.has(citationUrl)) {
      citationsDeduplicated += 1;
      return false;
    }
    return true;
  });

  return {
    article: {
      ...article,
      source_citations: newSourceCitations,
      citations,
    },
    metadata: {
      sourceCitationsAdded: newSourceCitations.length,
      citationsDeduplicated,
      drugUsersBibleCount,
      sourcesMissing,
      bySource,
    },
  };
}

export function populateDosageDuration({ article, sources }) {
  const parsedSubstances = sources?.parsedDosageDuration?.substances || {};
  const parsedData = parsedSubstances[dosageDurationSlugify(article.title)];

  if (!parsedData) {
    return { skipped: true, reason: "no parsed data" };
  }

  const newDosage = transformDosage(parsedData.dosage);
  const newDuration = transformDuration(parsedData.duration);
  const nextArticle = { ...article };

  if (newDosage.routes.length > 0) {
    nextArticle.dosage = newDosage;
  }

  if (newDuration.routes.length > 0) {
    nextArticle.duration = newDuration;
  }

  if (!newDosage.routes.length && !newDuration.routes.length) {
    return { skipped: true, reason: "no dosage or duration routes" };
  }

  return {
    article: nextArticle,
    metadata: {
      dosageRoutes: newDosage.routes.length,
      durationRoutes: newDuration.routes.length,
    },
  };
}
