"use client";

import { useCallback, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  buildQuickAddReference,
  detectQuickAddReference,
  fetchReferenceMetadata,
  hasReferenceMetadataLookup,
} from "@/lib/citations/referenceIntake";
import type { Reference } from "@/schema";

export type CitePopoverProps = {
  references: Reference[];
  addReference: (reference: Reference) => string;
  onInsert: (marker: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLookupWarning?: (message: string) => void;
  disabled?: boolean;
};

const MAX_SUGGESTIONS = 6;

function referenceLabel(reference: Reference): string {
  const year = reference.year ? ` (${reference.year})` : "";
  return `${reference.title || reference.id}${year}`;
}

export function CitePopover({ references, addReference, onInsert, open, onOpenChange, onLookupWarning, disabled = false }: CitePopoverProps) {
  const [query, setQuery] = useState("");
  const queryId = useId();
  const focusOnMount = useCallback((node: HTMLInputElement | null) => { node?.focus(); }, []);
  const [busy, setBusy] = useState(false);

  const detection = detectQuickAddReference(query);
  const needle = query.trim().toLowerCase();
  const matches = needle.length === 0
    ? references.slice(0, MAX_SUGGESTIONS)
    : references
      .filter((reference) => referenceLabel(reference).toLowerCase().includes(needle)
        || (reference.doi ?? "").toLowerCase().includes(needle)
        || (reference.id ?? "").toLowerCase().includes(needle))
      .slice(0, MAX_SUGGESTIONS);

  const close = () => {
    onOpenChange(false);
    setQuery("");
    setBusy(false);
  };

  const insert = (id: string) => {
    onInsert(`[cite:${id}]`);
    close();
  };

  const addPasted = async () => {
    if (!detection || busy) return;
    setBusy(true);
    let metadataTitle = detection.title ?? "";
    if (hasReferenceMetadataLookup(detection)) {
      try {
        const metadata = await fetchReferenceMetadata(detection);
        if (metadata?.title) metadataTitle = metadata.title;
      } catch {
        onLookupWarning?.("Metadata could not be loaded. The citation still applies and the source needs review.");
      }
    }
    const reference = buildQuickAddReference({
      detection,
      title: metadataTitle.trim() || detection.title?.trim() || query.trim(),
    });
    insert(addReference(reference));
  };

  const onQueryKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (detection) void addPasted();
    else if (matches.length === 1) insert(matches[0].id);
  };

  return (
    <Popover open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="glass"
          size="quiet"
          className="min-h-11 [@media(pointer:fine)]:min-h-0"
          disabled={disabled}
          onPointerDown={(event) => event.preventDefault()}
          onClick={(event) => event.stopPropagation()}
        >
          <Icon icon="lucide:quote" size={14} />
          Cite
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="w-80 max-w-[calc(100vw-2rem)] space-y-3"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Label htmlFor={queryId} className="theme-text-primary block text-sm">
          DOI, PubMed, ISBN, URL, or a source already cited
        </Label>
        <Input
          id={queryId}
          ref={focusOnMount}
          value={query}
          disabled={busy}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onQueryKeyDown}
        />
        {detection && <Button type="button" className="w-full" disabled={busy} onClick={() => { void addPasted(); }}>
          {busy ? "Adding" : `Add ${detection.label} and cite it here`}
        </Button>}
        {matches.length > 0 && <div className="space-y-1">
          <p className="theme-text-muted text-xs">Already cited on this article</p>
          {matches.map((reference) => (
            <Button
              key={reference.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto w-full justify-start whitespace-normal text-left"
              disabled={busy}
              onClick={() => insert(reference.id)}
            >
              {referenceLabel(reference)}
            </Button>
          ))}
        </div>}
        {matches.length === 0 && !detection && <p className="theme-text-muted text-sm">
          Paste an identifier to add a source, or type to search the sources this article already cites.
        </p>}
      </PopoverContent>
    </Popover>
  );
}
