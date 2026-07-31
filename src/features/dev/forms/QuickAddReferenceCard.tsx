import { useState, type KeyboardEvent } from "react";
import { useFormContext, type UseFieldArrayReturn } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildQuickAddReference,
  detectQuickAddReference,
  fetchReferenceMetadata,
  type ReferenceMetadata,
} from "@/lib/citations/referenceIntake";
import type { Reference, SubstanceArticle } from "@/schema";

import {
  parseReferenceAuthors,
  parseReferenceYear,
} from "./referenceFormShared";
import { EntryCard } from "./EntryCard";

/**
 * Detection and assembly moved to `@/lib/citations/referenceIntake` so the
 * review palette and its server route can mint the same reference this card
 * does. Re-exported here because this module is still the name importers know.
 */
export {
  buildQuickAddReference,
  detectQuickAddReference,
  type QuickAddReferenceDetection,
  type QuickAddReferenceKind,
} from "@/lib/citations/referenceIntake";

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
      const metadata = await fetchReferenceMetadata(nextDetection);
      if (metadata) applyMetadata(metadata);
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

    const reference: Reference = buildQuickAddReference({
      detection: nextDetection,
      title: referenceTitle,
      authors: parseReferenceAuthors(authors),
      year: parseReferenceYear(year),
      url,
    });
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
