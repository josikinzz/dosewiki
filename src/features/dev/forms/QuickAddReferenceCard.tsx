import { useState, type KeyboardEvent } from "react";
import { useFormContext, type UseFieldArrayReturn } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Reference, SubstanceArticle } from "@/schema";
import { deterministicReferenceId, normalizeDoi, normalizeIsbn, normalizePmid } from "../../../../lib/citations/referenceIdentity.mjs";

import {
  createEmptyReference,
  parseReferenceAuthors,
  parseReferenceYear,
} from "./referenceFormShared";
import { EntryCard } from "./EntryCard";

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

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

export async function copyCitationTag(id: string): Promise<boolean> {
  try {
    return await copyText(`[cite:${id}]`);
  } catch {
    return false;
  }
}

type ReferenceMetadata = Pick<Reference, "title" | "authors" | "year" | "url">;

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

export type QuickAddReferenceCardProps = {
  references: UseFieldArrayReturn<SubstanceArticle, "references">;
};

export function QuickAddReferenceCard({ references }: QuickAddReferenceCardProps) {
  const { watch } = useFormContext<SubstanceArticle>();
  const existingReferences = watch("references") ?? [];
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [year, setYear] = useState("");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [note, setNote] = useState("");
  const [addedId, setAddedId] = useState("");
  const [copied, setCopied] = useState(false);

  const detection = detectQuickAddReference(source, title);
  const existingReference = detection
    ? existingReferences.find((reference) => reference.id === detection.id)
    : undefined;

  const applyMetadata = (metadata: ReferenceMetadata) => {
    if (metadata.title) setTitle(metadata.title);
    if (metadata.authors.length > 0) setAuthors(metadata.authors.join(", "));
    if (metadata.year != null) setYear(String(metadata.year));
    if (metadata.url) setUrl(metadata.url);
  };

  const detectAndAutofill = async () => {
    const nextDetection = detectQuickAddReference(source, title);
    setAddedId("");
    setCopied(false);
    if (!nextDetection) return;

    if (nextDetection.kind === "title") {
      setTitle(nextDetection.title ?? source.trim());
      setUrl("");
      setNote("");
      return;
    }

    setUrl(nextDetection.url ?? "");
    setNote("");
    if (nextDetection.kind !== "doi" && nextDetection.kind !== "pmid") return;

    setIsLoading(true);
    try {
      applyMetadata(
        nextDetection.kind === "doi"
          ? await fetchDoiMetadata(nextDetection.doi!)
          : await fetchPmidMetadata(nextDetection.pmid!),
      );
    } catch {
      setNote("Metadata could not be loaded. You can complete the fields manually.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    const nextDetection = detectQuickAddReference(source, title);
    const referenceTitle = title.trim() || nextDetection?.title?.trim() || "";
    if (!nextDetection || !referenceTitle || existingReference) return;

    const reference: Reference = {
      ...createEmptyReference(),
      id: nextDetection.id,
      type: nextDetection.type,
      title: referenceTitle,
      authors: parseReferenceAuthors(authors),
      year: parseReferenceYear(year),
      url: url.trim() || nextDetection.url || null,
      doi: nextDetection.doi ?? null,
      pmid: nextDetection.pmid ?? null,
      isbn: nextDetection.isbn ?? null,
      sourceType: nextDetection.sourceType,
      supportStatus: "needs_review",
    };
    references.append(reference);
    setAddedId(nextDetection.id);
    setNote("");
  };

  const handleSourceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAdd();
    }
  };

  const handleCopy = async (id: string) => {
    const didCopy = await copyCitationTag(id);
    setCopied(didCopy);
  };

  return (
    <EntryCard title="Quick-add citation" bodyClassName="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {detection ? <Badge variant="secondary">{detection.label}</Badge> : null}
        {detection ? <Badge variant="outline">{detection.id}</Badge> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="quick-reference-source">DOI, PubMed, ISBN, URL, or title</Label>
        <Input
          id="quick-reference-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          onBlur={() => void detectAndAutofill()}
          onKeyDown={handleSourceKeyDown}
          placeholder="10.1000/example, PMID: 12345, or a source title"
        />
      </div>

      {detection ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="quick-reference-title">Title</Label>
              <Input
                id="quick-reference-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Article or source title"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quick-reference-authors">Authors</Label>
              <Input
                id="quick-reference-authors"
                value={authors}
                onChange={(event) => setAuthors(event.target.value)}
                placeholder="Author One, Author Two"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="quick-reference-year">Year</Label>
              <Input
                id="quick-reference-year"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                placeholder="2024"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quick-reference-url">URL</Label>
              <Input
                id="quick-reference-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </>
      ) : null}

      {isLoading ? <p className="theme-text-faint text-xs" role="status">Loading metadata…</p> : null}
      {note ? <p className="theme-text-faint text-xs" role="status">{note}</p> : null}

      {existingReference && detection && !addedId ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="theme-text-muted text-xs" role="status">Already cited on this article.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy(detection.id)}>
            {copied ? "Copied" : "Copy tag"}
          </Button>
        </div>
      ) : null}

      {addedId ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" className="normal-case tracking-normal text-sm">{`[cite:${addedId}]`}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy(addedId)}>
            {copied ? "Copied" : "Copy tag"}
          </Button>
          <p className="theme-text-muted text-xs">Paste it at the end of the sentence it supports; it renders as a numbered footnote.</p>
        </div>
      ) : null}

      <Button
        type="button"
        onClick={handleAdd}
        disabled={!detection || !(title.trim() || detection.title?.trim()) || Boolean(existingReference) || isLoading}
      >
        Add citation
      </Button>
    </EntryCard>
  );
}
