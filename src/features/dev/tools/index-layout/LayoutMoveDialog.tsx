"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { BoardDestination } from "./boardModel";
import { slotId, slotsEqual, type LayoutSlot } from "./layoutOps";

export type LayoutMoveRequest = {
  from: LayoutSlot;
  slug: string;
  name: string;
  fromLabel: string | null;
};

export interface LayoutMoveDialogProps {
  request: LayoutMoveRequest | null;
  destinations: readonly BoardDestination[];
  holds: (slot: LayoutSlot, slug: string) => boolean;
  onClose: () => void;
  onMove: (request: LayoutMoveRequest, to: LayoutSlot) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function LayoutMoveDialog({ request, destinations, holds, onClose, onMove, onCloseAutoFocus }: LayoutMoveDialogProps) {
  const [query, setQuery] = useState("");
  const [seenRequest, setSeenRequest] = useState(request);
  if (request !== seenRequest) {
    setSeenRequest(request);
    setQuery("");
  }

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const grouped = new Map<string, BoardDestination[]>();
    for (const destination of destinations) {
      const label = `${destination.categoryLabel} ${destination.sectionLabel ?? ""}`.toLowerCase();
      if (needle && !label.includes(needle)) continue;
      const list = grouped.get(destination.categoryLabel) ?? [];
      list.push(destination);
      grouped.set(destination.categoryLabel, list);
    }
    return [...grouped.entries()];
  }, [destinations, query]);

  const placing = request !== null && request.fromLabel === null;
  const title = request ? (placing ? `Place ${request.name}` : `Move ${request.name}`) : "";

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[85dvh] max-w-md flex-col" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {request?.fromLabel
              ? `Now in ${request.fromLabel}. Pick the list it moves to.`
              : "Pick the list it joins. It shows there once you commit."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            inputSize="sm"
            className="pl-9"
            aria-label="Find a list"
            placeholder="Find a list"
          />
        </div>
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2" role="group" aria-label="Lists">
          {groups.length === 0 ? (
            <p className="theme-text-muted py-4 text-sm">No list matches “{query.trim()}”.</p>
          ) : (
            groups.map(([categoryLabel, entries]) => (
              <section key={categoryLabel} className="py-2">
                <h3 className="type-meta-label theme-text-muted px-2.5 pb-1">{categoryLabel}</h3>
                <ul className="theme-dev-link-list -mx-2.5">
                  {entries.map((destination) => {
                    const current = request ? slotsEqual(destination.slot, request.from) : false;
                    const already = !current && request ? holds(destination.slot, request.slug) : false;
                    const off = current || already;
                    return (
                      <li key={slotId(destination.slot)}>
                        <button
                          type="button"
                          disabled={off}
                          onClick={() => request && onMove(request, destination.slot)}
                          className={cn(
                            "theme-dev-link-row flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-2.5 py-2 text-left text-sm",
                            off && "cursor-default opacity-60",
                          )}
                        >
                          <span className="min-w-0 break-words">{destination.sectionLabel ?? "Category list"}</span>
                          {off ? (
                            <span className="theme-text-faint shrink-0 text-xs">
                              <span className="sr-only">, </span>
                              {current ? "Here now" : "Already here"}
                            </span>
                          ) : (
                            <Icon icon="lucide:corner-down-right" size={14} className="theme-dev-link-row-chevron shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
