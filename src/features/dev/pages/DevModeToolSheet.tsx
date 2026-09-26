import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useId, useRef, useState, type RefObject } from "react";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import {
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  RAIL_GROUP_CAPTION_CLASS as GROUP_CAPTION_CLASS,
  RAIL_ICON_BUTTON_CLASS as ICON_BUTTON_CLASS,
  LockedToolList,
  SpokenLabel,
  ToolGlyph,
  countBadgeSuffix,
  ToolLabel,
  ToolMarks,
  guardedLinkProps,
} from "./DevModeToolRail";
import type { DevModeToolSheetProps, GroupView, LockedToolItem } from "./DevModeToolTypes";

/**
 * A tool in the sheet is a 48px tile, two to a row, so the whole catalog fits
 * one thumb-height instead of a list that scrolls past the fold. The glyph
 * leads so a tool is found by shape before it is read.
 */
const SHEET_TILE_CLASS =
  "theme-dev-rail-tab theme-dev-sheet-tile flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45";

/** Full-width rows for the sections, utilities and the way out. */
const SHEET_ROW_CLASS =
  "theme-dev-rail-tab flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45";

function SheetCaption({ children }: { children: string }) {
  return <span aria-hidden className={`${GROUP_CAPTION_CLASS} px-1 pb-1.5 pt-3`}>{children}</span>;
}

function SheetToolGroups({ groups, activeTab, isToolsSection, activeRowRef, onTabChange, onOpenHref }: {
  groups: readonly GroupView[];
  activeTab: DevModeToolSheetProps["activeTab"];
  isToolsSection: boolean;
  onTabChange: DevModeToolSheetProps["onTabChange"];
  onOpenHref?: (href: string) => void;
  activeRowRef: RefObject<HTMLButtonElement | HTMLAnchorElement | null>;
}) {
  return (
    <>
      {groups.filter((group) => group.enabled.length > 0).map((group) => (
        <div key={group.id} role="group" aria-label={group.label} className="flex flex-col">
          <SheetCaption>{group.label}</SheetCaption>
          <div className="grid grid-cols-2 gap-1">
            {group.enabled.map((item) => {
              const pending = item.pending ?? null;
              if (item.destination.kind === "external" && pending === null) {
                return (
                  <a key={item.id} {...guardedLinkProps(item.destination.href, onOpenHref)} title={`Opens ${item.label} full screen`} className={SHEET_TILE_CLASS}>
                    <ToolGlyph icon={item.icon} />
                    <ToolLabel label={item.label} badge={item.badge} stale={item.stale} atLeast={item.atLeast} className="min-w-0 leading-tight" />
                    <Icon icon="lucide:arrow-up-right" size={13} className="theme-text-faint shrink-0" />
                    <ToolMarks badge={item.badge} stale={item.stale} atLeast={item.atLeast} pushBadge />
                  </a>
                );
              }
              const isActive = isToolsSection && activeTab === item.id;
              return (
                <button key={item.id} ref={isActive ? (activeRowRef as RefObject<HTMLButtonElement>) : undefined} type="button" disabled={pending !== null} aria-disabled={pending !== null ? "true" : undefined} title={pending ?? undefined} aria-current={isActive ? "page" : undefined} data-state={isActive ? "active" : "inactive"} onClick={() => onTabChange(item.id)} className={SHEET_TILE_CLASS}>
                  <ToolGlyph icon={item.icon} />
                  <ToolLabel label={item.label} unsaved={item.unsaved} badge={item.badge} stale={item.stale} atLeast={item.atLeast} className="min-w-0 leading-tight" />
                  <ToolMarks unsaved={item.unsaved} badge={item.badge} stale={item.stale} atLeast={item.atLeast} pushBadge />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Tools above the role, folded behind one row so an editor's sheet leads with
 * the tools they can open. Each keeps its reason when unfolded.
 */
function SheetLockedGroup({ locked }: { locked: readonly LockedToolItem[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (locked.length === 0) return null;
  return (
    <div role="group" aria-label="Locked tools" className="theme-divider-border mt-2 flex flex-col border-t pt-1">
      <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)} className={cn(SHEET_ROW_CLASS, "theme-text-muted")}>
        <Icon icon="lucide:lock" size={16} className="shrink-0" />
        <SpokenLabel visible="Locked" spoken={`Locked, ${locked.length} locked`} />
        <span aria-hidden className="tabular-nums">{locked.length}</span>
        <ExpandIndicator isExpanded={open} variant="inline" className="ml-auto" />
      </button>
      <div id={listId} hidden={!open} className="pb-1">
        <LockedToolList locked={locked} />
      </div>
    </div>
  );
}

export function DevToolSheet({
  groups,
  locked,
  activeTab,
  isToolsSection,
  onTabChange,
  activePrimaryTab,
  activeLabel,
  activeIcon,
  attention,
  attentionStale,
  attentionAtLeast,
  unsavedAnywhere,
  changeLogLockReason,
  utilities,
  onPrimaryTabChange,
  onOpenPalette,
  onOpenHref,
  onLeave,
  session,
}: DevModeToolSheetProps) {
  const [open, setOpen] = useState(false);
  const activeRowRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const closeThen = <T,>(action: (value: T) => void) => (value: T) => {
    setOpen(false);
    action(value);
  };
  const changeLogActive = activePrimaryTab === "change-log";
  // A Change log the role cannot open lives with the other locked tools; one
  // that is only waiting on the session stays here, disabled with its reason.
  const changeLogShown = changeLogLockReason === null || !locked.some((item) => item.id === "change-log");
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button type="button" className="theme-dev-rail-tab flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control px-2.5 text-left text-base font-semibold transition-colors duration-200 motion-reduce:transition-none">
          <ToolGlyph icon={activeIcon} className="theme-dev-tool-glyph-active" />
          {/* One text run for the name, so it reads "Tools menu, current tool Tags, 3 awaiting review". */}
          <span className="sr-only">{`Tools menu, current tool ${activeLabel}${unsavedAnywhere ? ", unsaved changes" : ""}${attention ? countBadgeSuffix(attention, undefined, attentionStale, attentionAtLeast) : ""}`}</span>
          <span aria-hidden className="min-w-0 truncate">{activeLabel}</span>
          <ToolMarks unsaved={unsavedAnywhere} badge={attention} stale={attentionStale} atLeast={attentionAtLeast} />
          <ExpandIndicator isExpanded={open} variant="inline" className="theme-text-muted ml-auto shrink-0" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-label="Editor tools menu"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const row = activeRowRef.current;
            if (row) {
              row.focus();
              row.scrollIntoView({ block: "center" });
            }
          }}
          className="theme-overlay-surface fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-panel border theme-overlay-shadow duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom motion-reduce:animate-none"
        >
          <DialogDescription className="sr-only">Choose a tool, search for a record, open a utility, or leave the editor.</DialogDescription>
          <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
            <DialogTitle className="theme-text-primary text-base font-semibold">Tools</DialogTitle>
            <DialogPrimitive.Close aria-label="Close tools menu" className={`${ICON_BUTTON_CLASS} ml-auto`}><Icon icon="lucide:x" size={16} /></DialogPrimitive.Close>
          </div>
          {/* One scroller for every row: search, tools, then the site sections.
              Only the session line stays pinned, so a short phone never
              squeezes the tool list into a sliver above a fixed footer. */}
          <nav aria-label="Editor tools menu" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3">
            <button type="button" onClick={() => closeThen(onOpenPalette)(undefined)} className="theme-dev-sheet-search mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-control border px-3 text-left text-sm">
              <Icon icon="lucide:search" size={16} className="shrink-0" />
              <span>Search tools and records</span>
            </button>
            <SheetToolGroups groups={groups} activeTab={activeTab} isToolsSection={isToolsSection} activeRowRef={activeRowRef} onTabChange={closeThen(onTabChange)} onOpenHref={onOpenHref ? closeThen(onOpenHref) : undefined} />
            <div role="group" aria-label="Site sections" className="theme-divider-border mt-3 flex flex-col gap-0.5 border-t pt-1">
              <SheetCaption>More</SheetCaption>
              {changeLogShown ? (
                <button type="button" ref={changeLogActive ? (activeRowRef as RefObject<HTMLButtonElement>) : undefined} disabled={changeLogLockReason !== null} aria-disabled={changeLogLockReason !== null ? "true" : undefined} title={changeLogLockReason ?? undefined} aria-current={changeLogActive ? "page" : undefined} data-state={changeLogActive ? "active" : "inactive"} onClick={() => closeThen(onPrimaryTabChange)("change-log")} className={SHEET_ROW_CLASS}>
                  <ToolGlyph icon="lucide:history" />
                  Change log
                  {changeLogLockReason ? <span className="theme-text-muted ml-auto text-xs font-normal">{changeLogLockReason}</span> : null}
                </button>
              ) : null}
              {utilities.map((utility) => (
                <a key={utility.href} {...guardedLinkProps(utility.href, onOpenHref ? closeThen(onOpenHref) : undefined)} className={SHEET_ROW_CLASS}>
                  <ToolGlyph icon={utility.icon} />
                  {utility.label}
                </a>
              ))}
              <button type="button" onClick={() => closeThen(onLeave)(undefined)} className={SHEET_ROW_CLASS}>
                <ToolGlyph icon="lucide:log-out" />
                Leave editor
              </button>
            </div>
            <SheetLockedGroup locked={locked} />
          </nav>
          <div role="group" aria-label="Session" className="theme-divider-border flex shrink-0 items-center gap-3 border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{session}</div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
