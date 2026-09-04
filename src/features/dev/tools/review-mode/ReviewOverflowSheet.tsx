"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

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
  isCurrentFlagged: boolean;
  isTicking: boolean;
  toggleFlagged: () => void;
  /** The Webpage / Editor tabs; `onAfterChange` closes the sheet. */
  renderViewTabs: (onAfterChange: () => void) => ReactNode;
  moleculePanelOpen: boolean;
  citationPanelOpen: boolean;
  toggleMoleculePanel: () => void;
  toggleCitationPanel: () => void;
  openElsewhereItems: ReactNode;
  queueGroups: ReviewQueueGroup[];
  settingsPanel: ReactNode;
  settingsChanged: boolean;
}

/**
 * The home for whatever the current bar tier drops, gone entirely at `xl`
 * where the bar shows everything. Sections hide themselves once their control
 * is back in the bar, so the sheet never duplicates visible chrome. Popover
 * rather than a new Sheet primitive: the kit has no sheet, and one more shared
 * component would need a catalog entry to earn its keep.
 */
export function ReviewOverflowSheet({
  reviewedCount,
  total,
  progressFlourish,
  hasCurrent,
  isCurrentFlagged,
  isTicking,
  toggleFlagged,
  renderViewTabs,
  moleculePanelOpen,
  citationPanelOpen,
  toggleMoleculePanel,
  toggleCitationPanel,
  openElsewhereItems,
  queueGroups,
  settingsPanel,
  settingsChanged,
}: ReviewOverflowSheetProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  return (
    <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="iconGhost"
          size="auto"
          className={cn(
            "relative ml-auto shrink-0 lg:ml-0 2xl:hidden",
            TOUCH_ICON,
          )}
          aria-label="More review controls"
        >
          <Icon icon="lucide:ellipsis" size={18} />
          {settingsChanged ? (
            <span
              aria-hidden
              className="theme-review-settings-dot absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      {/* Near-full-bleed below `sm` — the sheet is the phone's whole
          control surface, so a desktop-tuned cap wastes the width it
          needs most. Collision padding keeps the edges symmetric once
          the panel is wider than its end-aligned anchor allows. */}
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="w-[calc(100vw-1rem)] max-h-[70dvh] space-y-4 overflow-y-auto sm:w-[21rem]"
      >
        <ProgressStrip
          reviewed={reviewedCount}
          total={total}
          flourish={progressFlourish}
        />

        <Button
          variant={isCurrentFlagged ? "iconWarning" : "pill"}
          size="pill"
          className={cn(
            "w-full justify-start rounded-full gap-2 md:hidden",
            TOUCH_PILL,
          )}
          onClick={toggleFlagged}
          disabled={!hasCurrent || isTicking}
          aria-pressed={isCurrentFlagged}
        >
          <Icon icon="lucide:flag" size={15} />
          {isCurrentFlagged
            ? "Flagged as in progress — tap to clear"
            : "Flag as in progress"}
        </Button>

        {/* border-dose-divider, NOT .theme-divider: that utility also
            paints background-color (it styles elements that ARE a 1px
            line), which turned these section wrappers into cards inside
            the popover card. Hairline separators only. */}
        <div className="space-y-3 border-t border-dose-divider pt-4">
          {/* Tabs and the panel pills rejoin the bar at `lg`; open-in
              below stays here until `2xl`. */}
          <div className="space-y-3 lg:hidden">
            {renderViewTabs(() => setOverflowOpen(false))}
            <Button
              variant={moleculePanelOpen ? "pillActive" : "pill"}
              size="pill"
              className={cn("w-full justify-start rounded-full gap-2", TOUCH_PILL)}
              onClick={() => {
                setOverflowOpen(false);
                toggleMoleculePanel();
              }}
              disabled={!hasCurrent}
              aria-expanded={moleculePanelOpen}
              aria-controls={MOLECULE_PANEL_ID}
            >
              <Icon icon="lucide:hexagon" size={14} />
              {moleculePanelOpen
                ? "Hide the molecule editor"
                : "Edit the molecule depiction"}
            </Button>
            <Button
              variant={citationPanelOpen ? "pillActive" : "pill"}
              size="pill"
              className={cn("w-full justify-start rounded-full gap-2", TOUCH_PILL)}
              onClick={() => {
                setOverflowOpen(false);
                toggleCitationPanel();
              }}
              disabled={!hasCurrent}
              aria-expanded={citationPanelOpen}
              aria-controls={CITATION_PANEL_ID}
            >
              <Icon icon="lucide:book-marked" size={14} />
              {citationPanelOpen
                ? "Hide the citation palette"
                : "Sources and citation markers"}
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="pill"
                size="pill"
                className={cn("w-full justify-start rounded-full gap-2", TOUCH_PILL)}
              >
                <Icon icon="lucide:external-link" size={15} />
                Open this article in…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {openElsewhereItems}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="border-t border-dose-divider pt-4">
          {/* Collapsed by default: the trophies are delight, not a
              control, and open they cost a third of the sheet. */}
          <ReviewTrophyShelf groups={queueGroups} collapsible />
        </div>
        <div className="border-t border-dose-divider pt-4">{settingsPanel}</div>
        <div className="border-t border-dose-divider pt-4">
          <ReviewHelpPanel />
        </div>
        {/* The phone row spends the dev-tools slot on ←/→, so the way
            out of the workbench lives here. Last on purpose: it is the
            only item that leaves the page. */}
        <div className="border-t border-dose-divider pt-4 sm:hidden">
          <Button
            asChild
            variant="pill"
            size="pill"
            className={cn("w-full justify-start rounded-full gap-2", TOUCH_PILL)}
          >
            <Link href="/dev">
              <Icon icon="lucide:arrow-left-to-line" size={15} />
              Back to Dev Tools
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
