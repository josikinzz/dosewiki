import { getFaviconForUrl } from "@/data/config/sourceFavicons";
import type { Reference } from "@/schema/substance/shared";
import { buildCitationNumbering, formatApaReference } from "./citations/referenceModel";
import { projectSubstanceCitationCompatibility } from "./citations/substanceCitationCompatibility";
import { normalizeDoi } from "../../lib/citations/referenceIdentity.mjs";

export const CITATION_COLLAPSED_LIMIT = 3;

export type CitationRole =
  | "primary-source"
  | "further-reading"
  | "reference"
  | "external-link"
  | "internal-link";

export type RawSubstanceCitation = {
  name?: string | null;
  url?: string | null;
};

export type RawEffectCitation = {
  text?: string | null;
  url?: string | null;
  from?: string | null;
};

export type RawExternalLink = {
  title?: string | null;
  url?: string | null;
};

export type RawSeeAlsoLink = {
  title?: string | null;
  location?: string | null;
};

export type ProjectedCitation = {
  role: CitationRole;
  label: string;
  url: string;
  favicon: string | null;
  number: number;
  anchorId: string;
  from?: string;
  referenceId?: string;
};

export type CitationProjectionGroup = {
  role: CitationRole;
  title: string;
  items: ProjectedCitation[];
  visibleItems: ProjectedCitation[];
  collapsedCount: number;
  hasCollapsedItems: boolean;
};

export type CitationProjection = {
  primarySources: CitationProjectionGroup;
  furtherReading: CitationProjectionGroup;
  references: CitationProjectionGroup;
  externalLinks: CitationProjectionGroup;
  internalRelatedLinks: CitationProjectionGroup;
  totalCount: number;
  isEmpty: boolean;
};

export type ProjectSubstanceCitationsInput = {
  article?: unknown;
  references?: Reference[] | null;
  sourceCitations?: RawSubstanceCitation[] | null;
  citations?: RawSubstanceCitation[] | null;
  expandedFurtherReading?: boolean;
  expandedReferences?: boolean;
};

export type ProjectEffectCitationsInput = {
  citations?: RawEffectCitation[] | null;
  externalLinks?: RawExternalLink[] | null;
  seeAlso?: RawSeeAlsoLink[] | null;
  expandedReferences?: boolean;
};

const EMPTY_GROUP_TITLES: Record<CitationRole, string> = {
  "primary-source": "Source Pages",
  "further-reading": "Further Reading",
  reference: "References",
  "external-link": "External Links",
  "internal-link": "See Also",
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCitationUrl(value: unknown): string {
  const trimmed = normalizeText(value);
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeCitationUrl(item.url).toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeGroup(
  role: CitationRole,
  items: ProjectedCitation[],
  expanded: boolean,
): CitationProjectionGroup {
  const canCollapse = role === "further-reading" || role === "reference";
  const visibleItems = canCollapse && !expanded
    ? items.slice(0, CITATION_COLLAPSED_LIMIT)
    : items;
  const collapsedCount = Math.max(0, items.length - visibleItems.length);

  return {
    role,
    title: EMPTY_GROUP_TITLES[role],
    items,
    visibleItems,
    collapsedCount,
    hasCollapsedItems: collapsedCount > 0,
  };
}

function projectUrlCitation(
  raw: RawSubstanceCitation | RawEffectCitation | RawExternalLink,
  role: Exclude<CitationRole, "internal-link">,
  index: number,
  labelFallback: string,
): ProjectedCitation | null {
  const url = normalizeText(raw.url);
  let rawLabel: string | null | undefined;
  if ("name" in raw) {
    rawLabel = raw.name;
  } else if ("text" in raw) {
    rawLabel = raw.text;
  } else if ("title" in raw) {
    rawLabel = raw.title;
  }
  const label = normalizeText(rawLabel) || labelFallback;
  const from = "from" in raw ? normalizeText(raw.from) : "";
  const number = index + 1;

  if (!url && !label) return null;

  return {
    role,
    label,
    url,
    favicon: url ? getFaviconForUrl(url) : null,
    number,
    anchorId: from ? `cite-${from}` : `cite-${number}`,
    ...(from ? { from } : {}),
  };
}

function projectInternalLink(raw: RawSeeAlsoLink, index: number): ProjectedCitation | null {
  const url = normalizeText(raw.location);
  const label = normalizeText(raw.title) || url;
  if (!url && !label) return null;

  return {
    role: "internal-link",
    label,
    url,
    favicon: null,
    number: index + 1,
    anchorId: `related-${index + 1}`,
  };
}

function emptyProjection(groups: Partial<Record<CitationRole, CitationProjectionGroup>>): CitationProjection {
  const primarySources = groups["primary-source"] ?? makeGroup("primary-source", [], true);
  const furtherReading = groups["further-reading"] ?? makeGroup("further-reading", [], true);
  const references = groups.reference ?? makeGroup("reference", [], true);
  const externalLinks = groups["external-link"] ?? makeGroup("external-link", [], true);
  const internalRelatedLinks = groups["internal-link"] ?? makeGroup("internal-link", [], true);
  const totalCount = primarySources.items.length
    + furtherReading.items.length
    + references.items.length
    + externalLinks.items.length
    + internalRelatedLinks.items.length;

  return {
    primarySources,
    furtherReading,
    references,
    externalLinks,
    internalRelatedLinks,
    totalCount,
    isEmpty: totalCount === 0,
  };
}

export function projectSubstanceCitations({
  article,
  references = [],
  sourceCitations = [],
  citations = [],
  expandedFurtherReading = false,
  expandedReferences = false,
}: ProjectSubstanceCitationsInput): CitationProjection {
  const numbering = buildCitationNumbering(references ?? [], article ?? {});
  const compatibility = projectSubstanceCitationCompatibility({
    references,
    sourceCitations,
    citations,
  });
  const structuredReferences: ProjectedCitation[] = numbering.numberedReferences.map((reference) => ({
    role: "reference",
    label: formatApaReference(reference),
    url: reference.url ?? (normalizeDoi(reference.doi) ? `https://doi.org/${normalizeDoi(reference.doi)}` : ""),
    favicon: reference.url ? getFaviconForUrl(reference.url) : null,
    number: reference.number,
    anchorId: reference.anchorId,
    referenceId: reference.id,
  }));

  const primarySources = dedupeByUrl(
    compatibility.sourceCitations
      .map((citation, index) => projectUrlCitation(citation, "primary-source", index, `Source ${index + 1}`))
      .filter((citation): citation is ProjectedCitation => citation !== null),
  );
  const furtherReading = dedupeByUrl(
    compatibility.citations
      .map((citation, index) => projectUrlCitation(citation, "further-reading", index, `Citation ${index + 1}`))
      .filter((citation): citation is ProjectedCitation => citation !== null),
  );

  return emptyProjection({
    reference: makeGroup("reference", structuredReferences, expandedReferences),
    "primary-source": makeGroup("primary-source", primarySources, true),
    "further-reading": makeGroup("further-reading", furtherReading, expandedFurtherReading),
  });
}

export function projectEffectCitations({
  citations = [],
  externalLinks = [],
  seeAlso = [],
  expandedReferences = false,
}: ProjectEffectCitationsInput): CitationProjection {
  const internalRelatedLinks = (seeAlso ?? [])
    .map(projectInternalLink)
    .filter((citation): citation is ProjectedCitation => citation !== null);
  const projectedExternalLinks = dedupeByUrl(
    (externalLinks ?? [])
      .map((link, index) => projectUrlCitation(link, "external-link", index, `External link ${index + 1}`))
      .filter((citation): citation is ProjectedCitation => citation !== null),
  );
  const references = dedupeByUrl(
    (citations ?? [])
      .map((citation, index) => projectUrlCitation(citation, "reference", index, `Reference ${index + 1}`))
      .filter((citation): citation is ProjectedCitation => citation !== null),
  );

  return emptyProjection({
    "internal-link": makeGroup("internal-link", internalRelatedLinks, true),
    "external-link": makeGroup("external-link", projectedExternalLinks, true),
    reference: makeGroup("reference", references, expandedReferences),
  });
}

export function getEffectReferenceTarget(
  to: string,
  citations: RawEffectCitation[] = [],
): { anchorId: string; number: number | string; label: string } {
  const projection = projectEffectCitations({ citations, expandedReferences: true });
  const citation = projection.references.items.find((item) => item.from === to);
  const parsedNumber = Number.parseInt(to, 10);
  const fallbackNumber = Number.isFinite(parsedNumber) ? parsedNumber : to;
  const number = citation?.number ?? fallbackNumber;
  const anchorId = citation?.anchorId ?? `cite-${number}`;

  return {
    anchorId,
    number,
    label: citation?.label ?? `Reference ${to}`,
  };
}
