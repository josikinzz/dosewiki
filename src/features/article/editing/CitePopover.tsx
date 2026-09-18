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

/**
 * Cite the sentence being edited, from inside the field.
 *
 * The old path was a clipboard hop: open the references panel elsewhere, add a
 * source, copy its marker, come back, paste. Editors reported that as two
 * tasks rather than one. Here the source is minted and its marker inserted at
 * the caret without the field ever closing.
 *
 * Detection, metadata lookup, and assembly come from `referenceIntake`, the
 * same functions the references panel's quick-add card uses, so a source
 * minted here and one minted there are the same reference with the same id.
 */
export type CitePopoverProps = {
  /** Sources the article already cites, offered for reuse before minting one. */
  references: Reference[];
  /** Appends the reference and answers with the id a marker must address. */
  addReference: (reference: Reference) => string;
  /** Receives the marker text to place at the caret. */
  onInsert: (marker: string) => void;
  /**
   * Controlled by the field, so activating a citation-needed flag can open the
   * field and this control in one step.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
};

/** How many stored sources the reuse list offers before it asks for a filter. */
const MAX_SUGGESTIONS = 6;

function referenceLabel(reference: Reference): string {
  const year = reference.year ? ` (${reference.year})` : "";
  return `${reference.title || reference.id}${year}`;
}

export function CitePopover({ references, addReference, onInsert, open, onOpenChange, disabled = false }: CitePopoverProps) {
  const [query, setQuery] = useState("");
  const queryId = useId();
  // The popover exists to be typed into, and Radix focuses the panel rather
  // than the field inside it. A ref avoids `autoFocus`, which the a11y rules
  // ban for surfaces that appear without being asked for; this one only ever
  // appears because an editor activated the control.
  const focusOnMount = useCallback((node: HTMLInputElement | null) => { node?.focus(); }, []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

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
    setNote("");
    setBusy(false);
  };

  const insert = (id: string) => {
    onInsert(`[cite:${id}]`);
    close();
  };

  /**
   * Mint the pasted identifier. Metadata is fetched first so the stored source
   * carries a real title, but a lookup that fails must not cost the editor the
   * citation: the marker still lands and the reference keeps the identifier as
   * its title for the citation workbench to finish.
   */
  const addPasted = async () => {
    if (!detection || busy) return;
    setBusy(true);
    setNote("");
    let metadataTitle = detection.title ?? "";
    if (hasReferenceMetadataLookup(detection)) {
      try {
        const metadata = await fetchReferenceMetadata(detection);
        if (metadata?.title) metadataTitle = metadata.title;
      } catch {
        setNote("Metadata could not be loaded. The citation still applies and the source needs review.");
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
      // Closes the popover only. The field around it stays open with the
      // draft intact, because cancelling a citation is not cancelling an edit.
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
          onChange={(event) => { setQuery(event.target.value); setNote(""); }}
          onKeyDown={onQueryKeyDown}
        />
        {detection && <Button type="button" className="w-full" disabled={busy} onClick={() => { void addPasted(); }}>
          {busy ? "Adding…" : `Add ${detection.label} and cite it here`}
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
        {note && <p role="alert" className="theme-text-muted text-sm">{note}</p>}
      </PopoverContent>
    </Popover>
  );
}
