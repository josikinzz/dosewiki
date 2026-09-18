import type { SubstanceArticle } from "@/schema";

import {
  buildCitationNumbering,
  renderCitationTokenText,
} from "./referenceModel";
import {
  extractCitationTokens,
  type CitationToken,
} from "./citationTokens";

type CitationPreviewEntry = {
  path: string;
  rawText: string;
  renderedText: string;
  tokenIds: string[];
  unknownIds: string[];
  duplicateAdjacentIds: string[];
}

type RouteReferencePreviewEntry = {
  kind: "dosage" | "duration";
  routeIndex: number;
  routeLabel: string;
  referenceIds: string[];
  renderedLabels: string[];
  unknownIds: string[];
  hasMultipleReferences: boolean;
}

export type EditorReferenceDiagnostics = {
  prosePreviews: CitationPreviewEntry[];
  routePreviews: RouteReferencePreviewEntry[];
  orphanedReferenceIds: string[];
  unknownInlineReferenceIds: string[];
  unknownStructuredReferenceIds: string[];
  duplicateAdjacentTokenIds: string[];
};

function collectCitationTextFields(
  value: unknown,
  path: string,
  entries: Array<{ path: string; value: string }>,
  seen: WeakSet<object>,
) {
  if (typeof value === "string") {
    if (value.includes("[cite:")) {
      entries.push({ path, value });
    }
    return;
  }

  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectCitationTextFields(item, `${path}[${index}]`, entries, seen);
    });
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    if (key === "references" || key === "source_citations" || key === "citations" || key === "editorial_review") {
      return;
    }
    collectCitationTextFields(child, path ? `${path}.${key}` : key, entries, seen);
  });
}

/**
 * Every string leaf in the article that contains a `[cite:` marker, paired
 * with the field path it lives at. Shared by the diagnostics panel and the
 * reference editor's removal cleanup so both walk the document identically.
 */
export function collectCitationTextEntries(root: unknown): Array<{ path: string; value: string }> {
  const entries: Array<{ path: string; value: string }> = [];
  collectCitationTextFields(root, "", entries, new WeakSet());
  return entries;
}

function collectDuplicateAdjacentIds(tokens: CitationToken[]): string[] {
  const duplicates: string[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1];
    const current = tokens[index];
    const between = current.index - (previous.index + previous.raw.length);
    if (current.id === previous.id && between === 0 && !duplicates.includes(current.id)) {
      duplicates.push(current.id);
    }
  }
  return duplicates;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildEditorReferenceDiagnostics(article: SubstanceArticle): EditorReferenceDiagnostics {
  const numbering = buildCitationNumbering(article.references ?? [], article);
  const textEntries = collectCitationTextEntries(article);

  const prosePreviews = textEntries.map(({ path, value }) => {
    const tokens = extractCitationTokens(value);
    const tokenIds = tokens.map((token) => token.id);
    const unknownIds = tokenIds.filter((id) => !numbering.referencesById.has(id));
    return {
      path,
      rawText: value,
      renderedText: renderCitationTokenText(value, numbering),
      tokenIds,
      unknownIds: unique(unknownIds),
      duplicateAdjacentIds: collectDuplicateAdjacentIds(tokens),
    };
  });

  const routePreviews: RouteReferencePreviewEntry[] = [];
  const registerRoutePreview = (
    kind: "dosage" | "duration",
    routeIndex: number,
    routeLabel: string,
    referenceIds: string[] | undefined,
  ) => {
    const ids = Array.isArray(referenceIds) ? referenceIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
    if (ids.length === 0) return;
    const unknownIds = ids.filter((id) => !numbering.referencesById.has(id));
    routePreviews.push({
      kind,
      routeIndex,
      routeLabel,
      referenceIds: ids,
      renderedLabels: ids.map((id) => {
        const number = numbering.numbersById.get(id);
        return number ? `[${number}] ${id}` : `[?] ${id}`;
      }),
      unknownIds: unique(unknownIds),
      hasMultipleReferences: ids.length > 1,
    });
  };

  (article.dosage?.routes ?? []).forEach((route, routeIndex) => {
    registerRoutePreview("dosage", routeIndex, route.route || `Dosage route ${routeIndex + 1}`, route.reference_ids);
  });
  (article.duration?.routes ?? []).forEach((route, routeIndex) => {
    registerRoutePreview("duration", routeIndex, route.route || `Duration route ${routeIndex + 1}`, route.reference_ids);
  });

  const citedIds = new Set([
    ...numbering.orderedIds,
    ...routePreviews.flatMap((preview) => preview.referenceIds),
  ]);
  const orphanedReferenceIds = (article.references ?? [])
    .map((reference) => reference.id)
    .filter((id) => typeof id === "string" && id.trim().length > 0 && !citedIds.has(id));

  return {
    prosePreviews,
    routePreviews,
    orphanedReferenceIds,
    unknownInlineReferenceIds: unique(prosePreviews.flatMap((preview) => preview.unknownIds)),
    unknownStructuredReferenceIds: unique(routePreviews.flatMap((preview) => preview.unknownIds)),
    duplicateAdjacentTokenIds: unique(prosePreviews.flatMap((preview) => preview.duplicateAdjacentIds)),
  };
}
