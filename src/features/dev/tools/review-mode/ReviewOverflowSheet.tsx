"use client";

import Link from "next/link";
import { useState, type MouseEvent, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TOUCH_ICON, TOUCH_PILL } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import {
  CITATION_PANEL_ID,
  MOLECULE_PANEL_ID,
  ProgressStrip,
  ReviewHelpPanel,
  type ProgressFlourish,
} from "./ReviewBarChrome";
import type { ReviewQueueGroup } from "./reviewQueue";
import { ReviewTrophyShelf } from "./ReviewTrophyShelf";

interface ReviewOverflowSheetProps {
  reviewedCount: number;
  total: number;
  progressFlourish: ProgressFlourish | null;
  hasCurrent: boolean;
  /** The Webpage / Editor tabs; `onAfterChange` closes the sheet. */
  renderViewTabs: (onAfterChange: () => void) => ReactNode;
  moleculePanelOpen: boolean;
  citationPanelOpen: boolean;
  toggleMoleculePanel: () => void;
  toggleCitationPanel: () => void;
  inlineEditActive: boolean;
  inlineEditReason: string | null;
  toggleInlineEdit: () => void;
  openElsewhereItems: ReactNode;
  queueGroups: ReviewQueueGroup[];
  settingsPanel: ReactNode;
  settingsChanged: boolean;
  onLeave: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Editors recommend instead of signing off; the help says so. */
  recommend?: boolean;
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-dose-divider pt-4 first:border-t-0 first:pt-0">
      <h2 className="type-meta-label theme-text-muted">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Everything the bar drops below `lg`: progress, the view, the three tools,
 * Open in, queue settings, trophies, help, and the way back to the editor.
 * The decisions are not here; they live in the review dock. A popover rather
 * than a new Sheet primitive: the kit has no sheet.
 */
export function ReviewOverflowSheet({
  reviewedCount,
  total,
  progressFlourish,
  hasCurrent,
  renderViewTabs,
  moleculePanelOpen,
  citationPanelOpen,
  toggleMoleculePanel,
  toggleCitationPanel,
  inlineEditActive,
  inlineEditReason,
  toggleInlineEdit,
  openElsewhereItems,
  queueGroups,
  settingsPanel,
  settingsChanged,
  onLeave,
  recommend = false,
}: ReviewOverflowSheetProps) {
  const [open, setOpen] = useState(false);
  const row = cn("w-full justify-start gap-2", TOUCH_PILL);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="iconGhost"
          size="auto"
          className={cn("relative shrink-0 lg:hidden", TOUCH_ICON)}
          aria-label="More review controls"
        >
          <Icon icon="lucide:ellipsis" size={18} />
          {settingsChanged ? (
            <>
              <span aria-hidden className="theme-review-settings-dot absolute right-1 top-1 h-1.5 w-1.5 rounded-full" />
              <span className="sr-only">, queue settings are off their defaults</span>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      {/* Near-full-bleed below `sm`: on a phone this is the whole tool surface. */}
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="max-h-[75dvh] w-[calc(100vw-1rem)] space-y-4 overflow-y-auto sm:w-[22rem]"
      >
        <ProgressStrip reviewed={reviewedCount} total={total} flourish={progressFlourish} />

        <SheetSection title="View">
          {renderViewTabs(() => setOpen(false))}
        </SheetSection>

        <SheetSection title="Tools">
          <div className="grid gap-2">
            <Button
              variant={moleculePanelOpen ? "pillActive" : "outline"}
              className={row}
              onClick={() => {
                setOpen(false);
                toggleMoleculePanel();
              }}
              disabled={!hasCurrent}
              aria-expanded={moleculePanelOpen}
              aria-controls={MOLECULE_PANEL_ID}
            >
              <Icon icon="lucide:hexagon" size={15} />
              {moleculePanelOpen ? "Hide the molecule editor" : "Edit the molecule depiction"}
            </Button>
            <Button
              variant={citationPanelOpen ? "pillActive" : "outline"}
              className={row}
              onClick={() => {
                setOpen(false);
                toggleCitationPanel();
              }}
              disabled={!hasCurrent}
              aria-expanded={citationPanelOpen}
              aria-controls={CITATION_PANEL_ID}
            >
              <Icon icon="lucide:book-marked" size={15} />
              {citationPanelOpen ? "Hide the citation palette" : "Sources and citation markers"}
            </Button>
            <Button
              variant={inlineEditActive ? "iconWarning" : "outline"}
              className={row}
              onClick={() => {
                setOpen(false);
                toggleInlineEdit();
              }}
              disabled={!hasCurrent || inlineEditReason !== null}
              aria-pressed={inlineEditActive}
            >
              <Icon icon="lucide:pencil-line" size={15} />
              {inlineEditActive ? "Inline editing is on" : "Edit text in place"}
            </Button>
            {inlineEditReason ? <p className="theme-text-faint text-xs">{inlineEditReason}.</p> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={row} aria-label="Open this article in another tool">
                  <Icon icon="lucide:external-link" size={15} />
                  Open this article in
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">{openElsewhereItems}</DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SheetSection>

        <SheetSection title="Queue settings">{settingsPanel}</SheetSection>

        <section className="border-t border-dose-divider pt-4">
          {/* Folded: the trophies are delight, not a control. */}
          <ReviewTrophyShelf groups={queueGroups} collapsible />
        </section>

        <section className="border-t border-dose-divider pt-4">
          <ReviewHelpPanel recommend={recommend} />
        </section>

        <section className="border-t border-dose-divider pt-4 sm:hidden">
          <Button asChild variant="outline" className={row}>
            <Link href="/dev" onClick={onLeave}>
              <Icon icon="lucide:arrow-left-to-line" size={15} />
              Leave review
            </Link>
          </Button>
        </section>
      </PopoverContent>
    </Popover>
  );
}
