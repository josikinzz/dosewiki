import type { Reference } from "@/schema/substance/shared";
import {
  deterministicReferenceId,
  normalizeDoi,
  normalizeIsbn,
  normalizePmid,
} from "../../../lib/citations/referenceIdentity.mjs";

export type QuickAddReferenceKind = "doi" | "pmid" | "isbn" | "url" | "title";

export type QuickAddReferenceDetection = {
  kind: QuickAddReferenceKind;
  label: string;
  type: Reference["type"];
  sourceType: Reference["sourceType"];
  doi?: string;
  pmid?: string;
  isbn?: string;
  url?: string;
  title?: string;
  id: string;
};

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function detectQuickAddReference(value: string, title = ""): QuickAddReferenceDetection | null {
  const input = value.trim();
  if (!input) return null;

  const doi = normalizeDoi(input);
  if (doi) {
    return {
      kind: "doi",
      label: "Journal article · DOI detected",
      type: "journal_article",
      sourceType: "primary_literature",
      doi,
      url: `https://doi.org/${doi}`,
      id: deterministicReferenceId({ doi }),
    };
  }

  const pmid = normalizePmid(input);
  if (pmid) {
    return {
      kind: "pmid",
      label: "Journal article · PMID detected",
      type: "journal_article",
      sourceType: "medical_database",
      pmid,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}`,
      id: deterministicReferenceId({ pmid }),
    };
  }

  const isbn = normalizeIsbn(input);
  if (isbn) {
    return {
      kind: "isbn",
      label: "Book · ISBN detected",
      type: "book",
      sourceType: "book",
      isbn,
      id: deterministicReferenceId({ isbn }),
    };
  }

  if (isHttpUrl(input)) {
    return {
      kind: "url",
      label: "Webpage · URL detected",
      type: "webpage",
      sourceType: "unknown",
      url: input,
      id: deterministicReferenceId({ url: input }),
    };
  }

  const fallbackTitle = title.trim() || input;
  return {
    kind: "title",
    label: "Webpage · title detected",
    type: "webpage",
    sourceType: "unknown",
    title: fallbackTitle,
    id: deterministicReferenceId({ title: fallbackTitle }),
  };
}

export function createEmptyReference(): Reference {
  return {
    id: "",
    type: "unknown",
    title: "",
    authors: [],
    year: null,
    date: null,
    containerTitle: null,
    siteName: null,
    publisher: null,
    volume: null,
    issue: null,
    pages: null,
    articleNumber: null,
    doi: null,
    pmid: null,
    isbn: null,
    url: null,
    accessedAt: null,
    sourceType: "unknown",
    quality: "fallback",
    apaText: null,
  };
}

export type QuickAddReferenceInput = {
  detection: QuickAddReferenceDetection;
  title: string;
  authors?: string[];
  year?: Reference["year"];
  url?: string | null;
};

export function buildQuickAddReference({
  detection,
  title,
  authors = [],
  year = null,
  url = null,
}: QuickAddReferenceInput): Reference {
  return {
    ...createEmptyReference(),
    id: detection.id,
    type: detection.type,
    title,
    authors,
    year,
    url: url?.trim() || detection.url || null,
    doi: detection.doi ?? null,
    pmid: detection.pmid ?? null,
    isbn: detection.isbn ?? null,
    sourceType: detection.sourceType,
    supportStatus: "needs_review",
  };
}

export type ReferenceMetadata = Pick<Reference, "title" | "authors" | "year" | "url">;

async function fetchDoiMetadata(doi: string): Promise<ReferenceMetadata> {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!response.ok) throw new Error("Crossref metadata request failed");
  const message = (await response.json()).message as {
    title?: string[];
    author?: Array<{ given?: string; family?: string; name?: string }>;
    issued?: { "date-parts"?: number[][] };
    published?: { "date-parts"?: number[][] };
    URL?: string;
  };
  const year = message.issued?.["date-parts"]?.[0]?.[0] ?? message.published?.["date-parts"]?.[0]?.[0];

  return {
    title: message.title?.[0] ?? "",
    authors: (message.author ?? [])
      .map((author) => author.name ?? [author.given, author.family].filter(Boolean).join(" "))
      .filter(Boolean),
    year: year ? String(year) : null,
    url: message.URL ?? `https://doi.org/${doi}`,
  };
}

async function fetchPmidMetadata(pmid: string): Promise<ReferenceMetadata> {
  const query = new URLSearchParams({ db: "pubmed", id: pmid, retmode: "json" });
  const response = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${query}`);
  if (!response.ok) throw new Error("PubMed metadata request failed");
  const result = (await response.json()).result?.[pmid] as {
    title?: string;
    authors?: Array<{ name?: string }>;
    pubdate?: string;
  } | undefined;
  if (!result) throw new Error("PubMed metadata was unavailable");

  return {
    title: result.title ?? "",
    authors: (result.authors ?? []).map((author) => author.name ?? "").filter(Boolean),
    year: result.pubdate?.match(/\b(\d{4})\b/)?.[1] ?? null,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}`,
  };
}

export function hasReferenceMetadataLookup(detection: QuickAddReferenceDetection): boolean {
  return (
    (detection.kind === "doi" && Boolean(detection.doi)) ||
    (detection.kind === "pmid" && Boolean(detection.pmid))
  );
}

export async function fetchReferenceMetadata(
  detection: QuickAddReferenceDetection,
): Promise<ReferenceMetadata | null> {
  if (detection.kind === "doi" && detection.doi) return fetchDoiMetadata(detection.doi);
  if (detection.kind === "pmid" && detection.pmid) return fetchPmidMetadata(detection.pmid);
  return null;
}
