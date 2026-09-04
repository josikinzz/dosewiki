"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { canDraft, getRoleDisplayName, getRoleFloorLockReason, type AppRole } from "@/lib/auth/roles";
import type { DevModePrimaryTab } from "./devModePageUtils";
import {
  DEV_TAB_REGISTRY,
  findDevTab,
  type DevModeTab,
  type DevTabDescriptor,
  type DevToolGroup,
} from "./devTabRegistry";
import { DEV_UTILITIES, DevUtilitiesMenu } from "./DevUtilitiesMenu";
import { useDevRailBadges } from "./useDevRailBadges";

/**
 * `badge` is an optional count of work waiting inside a tool. It is rendered
 * only when it resolves to a positive number, so a tab whose count has not
 * arrived (or is zero) looks exactly as it did before.
 */
type ToolTabItem = Pick<DevTabDescriptor, "id" | "label" | "role" | "destination"> & {
  badge?: number;
  /** Set while the session is still resolving: the tab renders, but waits. */
  pending?: string;
};

/** A tab the signed-in role may not open, paired with the reason why. */
type LockedToolItem = ToolTabItem & { reason: string };

/**
 * Rail groups in display order, each holding its descriptors in registry
 * order. `TOOL_GROUPS` is derived once from the registry so a new tab appears
 * here without touching this file.
 */
const TOOL_GROUPS: readonly { id: DevToolGroup; label: string; tabs: readonly DevTabDescriptor[] }[] = (
  [
    { id: "content", label: "Content" },
    { id: "intake", label: "Intake" },
    { id: "site", label: "Site" },
  ] as const
).map((group) => ({ ...group, tabs: DEV_TAB_REGISTRY.filter((tab) => tab.group === group.id) }));

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type DevModePageChromeProps = {
  activePrimaryTab: DevModePrimaryTab;
  activeTab: DevModeTab;
  isSignedIn: boolean;
  role: AppRole | null;
  sessionStatus: SessionStatus;
  userEmail?: string | null;
  userImage?: string | null;
  userName?: string | null;
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onTabChange: (tab: DevModeTab) => void;
  onSignIn: () => void;
  /** Leave the editor for the public site; carries the unsaved-changes confirm. */
  onLeave: () => void;
};

/**
 * The tablet-and-up rail is one row at every width. The Content group stays
 * inline as pills; Intake and Site collapse into dropdown menus whose triggers
 * roll up their badges, so every group name is always visible. Tools the
 * signed-in role may not open leave the rail for a single Locked menu that
 * lists them with the reason. The strip still scrolls sideways inside its own
 * box when the inline head overflows, while the trailing cluster never leaves
 * the row. Under `md` the rail is replaced by a single bar whose button opens
 * `DevToolSheet`.
 */
const RAIL_CLASS =
  "theme-dev-rail hidden min-h-10 w-full flex-nowrap items-center gap-1 rounded-lg border px-1.5 py-1 md:flex";

/**
 * The strip: a bounded, horizontally scrolling box with its scrollbar hidden.
 * An edge fades only while more tabs sit past it (`data-scroll-start` /
 * `data-scroll-end`), and the padding matches the fade so a tab at the true
 * end is never dimmed.
 */
const RAIL_STRIP_CLASS =
  "relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain px-3 py-1 scroll-px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden motion-safe:scroll-smooth"
  + " data-scroll-start:[mask-image:linear-gradient(to_right,transparent,#000_0.75rem)]"
  + " data-scroll-end:[mask-image:linear-gradient(to_left,transparent,#000_0.75rem)]"
  + " data-scroll-start:data-scroll-end:[mask-image:linear-gradient(to_right,transparent,#000_0.75rem,#000_calc(100%_-_0.75rem),transparent)]";

/** How far past the active tab the strip scrolls so its neighbour shows too. */
const RAIL_SCROLL_MARGIN_PX = 24;

/** A scroll button pages the strip by most of its width, keeping one tab of overlap. */
const RAIL_SCROLL_PAGE_RATIO = 0.7;

/** Slack before an edge counts as reached, so sub-pixel scroll offsets never flicker a fade. */
const RAIL_EDGE_SLACK_PX = 4;

const RAIL_TAB_CLASS =
  "theme-dev-rail-tab shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[0.8125rem] font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45 data-[state=active]:font-semibold [@media(pointer:coarse)]:min-h-11";

/** Sheet rows: full width, 44px tall, same state styling as the rail tabs. */
const SHEET_TAB_CLASS =
  "theme-dev-rail-tab flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[0.9375rem] font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45 data-[state=active]:font-semibold";

/**
 * Menu rows: the sheet row treatment at menu width, one step smaller, and back
 * to a 44px row wherever the pointer is coarse.
 */
const MENU_TAB_CLASS =
  "theme-dev-rail-tab flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[0.8125rem] font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none data-[state=active]:font-semibold [@media(pointer:coarse)]:min-h-11";

/** Menu panel: kit surface, plus the reduced-motion opt-out the kit omits. */
const MENU_CONTENT_CLASS = "p-1.5 motion-reduce:animate-none";

const RAIL_GROUP_CAPTION_CLASS =
  "theme-dev-rail-group shrink-0 select-none px-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em]";

const RAIL_ICON_BUTTON_CLASS =
  `theme-dev-rail-button flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-200 motion-reduce:transition-none ${TOUCH_ICON}`;

/**
 * A rail short enough to stay flat: when a role can open at most this many
 * tools total, every group stays inline (a contributor's whole rail fits) and
 * no menu stands between them and their own tools.
 */
const INLINE_RAIL_TOTAL_LIMIT = 5;

/**
 * The dev surface's own page title. The visible headings belong to the tools
 * themselves; this one exists so the landmark structure and the document
 * outline always have a level-one anchor, and so screen-reader users hear
 * where they are before the rail.
 */
function DevSurfaceTitle() {
  return <h1 className="sr-only">Dev Tools</h1>;
}

function RailDivider() {
  return (
    <span
      aria-hidden
      className="theme-dev-rail-divider mx-1 h-4 w-px shrink-0"
    />
  );
}

/**
 * The waiting card, rendered *inside* the shell rather than instead of it.
 * The tab rail stays interactive so a tool that needs nothing from the corpus
 * is one click away while the drain finishes; it doubles as the fallback for
 * the lazily-loaded tool bundles. The stalled hint only appears once the wait
 * has gone on long enough to need one.
 */
export function DevToolLoadingPanel({ label = "Loading tool" }: { label?: string }) {
  return (
    <StateCard
      loading
      compact
      className="mt-16"
      title={label}
      footer={
        <span className="theme-loading-stalled-label block whitespace-nowrap">
          Still loading. Refresh if nothing appears.
        </span>
      }
    />
  );
}

/**
 * A work-waiting count. The number is visual only; screen readers get the
 * full phrase so a menu trigger reads "Intake, 8 awaiting review" instead of
 * "Intake8".
 */
function CountBadge({ count, label = "awaiting review" }: { count: number; label?: string }) {
  return (
    <>
      <span
        aria-hidden
        title={`${count} ${label}`}
        className="theme-portal-count-badge inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold leading-none"
      >
        {count}
      </span>
      <span className="sr-only">{`, ${count} ${label}`}</span>
    </>
  );
}

type GroupView = {
  id: DevToolGroup;
  label: string;
  /** Tabs the signed-in role may open (plus external launchers, which gate themselves). */
  enabled: ToolTabItem[];
  /** Tabs the role may not open, with the reason, for the Locked menu. */
  locked: LockedToolItem[];
};

/**
 * Splits every group's tabs by the signed-in role. External launchers (Review)
 * are always enabled: the destination enforces its own role gate.
 *
 * While the session is still resolving, `pendingReason` keeps every tab in
 * `enabled` and marks it pending instead. The rail then holds its final shape
 * (inline head plus group menus) through the wait, rather than collapsing to
 * "everything is locked" for a beat and snapping back once the role lands.
 */
function splitGroupsByRole(
  groups: readonly { id: DevToolGroup; label: string; tabs: readonly ToolTabItem[] }[],
  role: AppRole | null,
  pendingReason: string | null,
): GroupView[] {
  return groups.map((group) => {
    const enabled: ToolTabItem[] = [];
    const locked: LockedToolItem[] = [];
    for (const tab of group.tabs) {
      if (tab.destination.kind === "external") {
        enabled.push(tab);
        continue;
      }
      if (pendingReason !== null) {
        enabled.push({ ...tab, pending: pendingReason });
        continue;
      }
      const reason = getRoleFloorLockReason(role, tab.role);
      if (reason === null) {
        enabled.push(tab);
      } else {
        locked.push({ ...tab, reason });
      }
    }
    return { ...group, enabled, locked };
  });
}

/** One inline rail pill: a tool button, or an external launcher link. */
function RailPill({ item, isActive, onTabChange }: { item: ToolTabItem; isActive: boolean; onTabChange: (tab: DevModeTab) => void }) {
  const badge = item.badge ? <CountBadge count={item.badge} /> : null;
  if (item.destination.kind === "external") {
    return (
      <a
        href={item.destination.href}
        title={`Opens ${item.label} full screen`}
        className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1`}
      >
        {item.label}
        <Icon icon="lucide:arrow-up-right" size={12} className="text-current" />
        {badge}
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={item.pending !== undefined}
      aria-disabled={item.pending !== undefined ? "true" : undefined}
      title={item.pending}
      aria-current={isActive ? "page" : undefined}
      data-state={isActive ? "active" : "inactive"}
      onClick={() => onTabChange(item.id)}
      className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1.5`}
    >
      {item.label}
      {badge}
    </button>
  );
}

/** An inline rail group: caption plus its enabled pills, one unbreakable run. */
function RailInlineGroup({
  label,
  tabs,
  activeTab,
  isToolsSection,
  onTabChange,
  showDivider,
}: {
  label: string;
  tabs: readonly ToolTabItem[];
  activeTab: DevModeTab;
  isToolsSection: boolean;
  onTabChange: (tab: DevModeTab) => void;
  showDivider: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-0.5">
      {showDivider ? <RailDivider /> : null}
      <span aria-hidden className={RAIL_GROUP_CAPTION_CLASS}>
        {label}
      </span>
      {tabs.map((item) => (
        <RailPill
          key={item.id}
          item={item}
          isActive={isToolsSection && activeTab === item.id}
          onTabChange={onTabChange}
        />
      ))}
    </div>
  );
}

type RailMenuCommonProps = {
  activeTab: DevModeTab;
  isToolsSection: boolean;
  onTabChange: (tab: DevModeTab) => void;
};

/**
 * One rail group as a dropdown menu: the trigger carries the group name, the
 * rolled-up badge count, and the `ExpandIndicator` disclosure cue; the items
 * are the group's enabled tools. The trigger takes the active styling when
 * the current tool lives inside it, so "you are here" survives the collapse.
 */
function RailGroupMenu({
  label,
  tabs,
  activeTab,
  isToolsSection,
  onTabChange,
  showDivider,
}: RailMenuCommonProps & { label: string; tabs: readonly ToolTabItem[]; showDivider: boolean }) {
  const [open, setOpen] = useState(false);
  const isActive = isToolsSection && tabs.some((tab) => tab.id === activeTab);
  const badgeTotal = tabs.reduce((sum, tab) => sum + (tab.badge ?? 0), 0);
  // Every tool waiting on the session means the group has nothing to offer yet.
  const pending = tabs.find((tab) => tab.pending)?.pending;
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center">
      {showDivider ? <RailDivider /> : null}
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending !== undefined}
            aria-disabled={pending !== undefined ? "true" : undefined}
            title={pending}
            data-active={isActive || undefined}
            className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1.5`}
          >
            {label}
            {badgeTotal > 0 ? <CountBadge count={badgeTotal} /> : null}
            <ExpandIndicator isExpanded={open} variant="compact" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" aria-label={`${label} tools`} className={`w-56 ${MENU_CONTENT_CLASS}`}>
          {tabs.map((item) => {
            const itemActive = isToolsSection && activeTab === item.id;
            if (item.destination.kind === "external") {
              return (
                <DropdownMenuItem key={item.id} asChild className={MENU_TAB_CLASS}>
                  <a href={item.destination.href}>
                    {item.label}
                    <Icon icon="lucide:arrow-up-right" size={12} className="text-current" />
                    {item.badge ? <CountBadge count={item.badge} /> : null}
                  </a>
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem
                key={item.id}
                aria-current={itemActive ? "page" : undefined}
                disabled={item.pending !== undefined}
                data-state={itemActive ? "active" : "inactive"}
                onSelect={() => onTabChange(item.id)}
                className={MENU_TAB_CLASS}
              >
                {item.label}
                {item.badge ? <CountBadge count={item.badge} /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The Locked overflow: every tool the signed-in role may not open, listed with
 * the reason. Rows stay disabled but focusable, so keyboard and screen-reader
 * users meet the reason instead of a gap.
 */
function RailLockedMenu({ locked }: { locked: readonly LockedToolItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div role="group" aria-label="Locked tools" className="flex shrink-0 items-center">
      <RailDivider />
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1.5`}
          >
            Locked
            <CountBadge count={locked.length} label="locked" />
            <ExpandIndicator isExpanded={open} variant="compact" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" aria-label="Locked tools" className={`w-64 ${MENU_CONTENT_CLASS}`}>
          {locked.map((item) => (
            <DropdownMenuItem key={item.id} disabled className={`${MENU_TAB_CLASS} justify-between gap-3`}>
              <span>{item.label}</span>
              <span className="theme-text-muted text-xs font-normal">{item.reason}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type SheetListProps = {
  groups: readonly GroupView[];
  activeTab: DevModeTab;
  isToolsSection: boolean;
  onTabChange: (tab: DevModeTab) => void;
  /** Receives the active row so the sheet can focus and reveal it on open. */
  activeRowRef: RefObject<HTMLButtonElement | HTMLAnchorElement | null>;
};

/**
 * The sheet's tool rows: every group, every tab (locked rows carry their
 * reason inline), rendered once from the same registry iteration as the rail
 * so badges and lock reasons never drift.
 */
function SheetToolList({ groups, activeTab, isToolsSection, activeRowRef, onTabChange }: SheetListProps) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.id} role="group" aria-label={group.label} className="flex flex-col gap-0.5">
          <span aria-hidden className={`${RAIL_GROUP_CAPTION_CLASS} px-3 pb-1 pt-2`}>
            {group.label}
          </span>
          {[
            ...group.enabled.map((item) => ({ item, lockReason: item.pending ?? null })),
            ...group.locked.map((item) => ({ item, lockReason: item.reason as string | null })),
          ].map(({ item, lockReason }) => {
            const badge = item.badge ? <CountBadge count={item.badge} /> : null;
            if (item.destination.kind === "external") {
              return (
                <a
                  key={item.id}
                  href={item.destination.href}
                  title={`Opens ${item.label} full screen`}
                  className={SHEET_TAB_CLASS}
                >
                  {item.label}
                  <Icon icon="lucide:arrow-up-right" size={12} className="text-current" />
                  {badge}
                </a>
              );
            }
            const isActive = isToolsSection && activeTab === item.id;
            return (
              <button
                key={item.id}
                ref={isActive ? (activeRowRef as RefObject<HTMLButtonElement>) : undefined}
                type="button"
                disabled={lockReason !== null}
                aria-disabled={lockReason !== null ? "true" : undefined}
                aria-current={isActive ? "page" : undefined}
                data-state={isActive ? "active" : "inactive"}
                onClick={() => onTabChange(item.id)}
                className={SHEET_TAB_CLASS}
              >
                {item.label}
                {badge}
                {lockReason ? (
                  <span className="theme-text-muted ml-auto text-xs font-normal">{lockReason}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

type DevToolSheetProps = {
  groups: readonly GroupView[];
  activeTab: DevModeTab;
  isToolsSection: boolean;
  onTabChange: (tab: DevModeTab) => void;
  activePrimaryTab: DevModePrimaryTab;
  activeLabel: string;
  changeLogLockReason: string | null;
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onLeave: () => void;
  /** Sign-in / sign-out controls; the phone bar hosts them here instead of beside the tool button. */
  session: ReactNode;
};

/**
 * Phone tool menu: a bottom sheet with a sticky header (grabber, title, close),
 * a scrolling middle holding the three tool groups, and a sticky footer holding
 * Change log, the utility routes, Leave editor, and the session controls, so
 * the way out never scrolls away. Opening the sheet focuses and reveals the
 * active row; selecting anything closes it.
 */
function DevToolSheet({
  groups,
  activeTab,
  isToolsSection,
  onTabChange,
  activePrimaryTab,
  activeLabel,
  changeLogLockReason,
  onPrimaryTabChange,
  onLeave,
  session,
}: DevToolSheetProps) {
  const [open, setOpen] = useState(false);
  const activeRowRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const closeThen = <T,>(action: (value: T) => void) => (value: T) => {
    setOpen(false);
    action(value);
  };
  const changeLogActive = activePrimaryTab === "change-log";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Tools menu, current tool ${activeLabel}`}
          className="theme-dev-rail-tab flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-3 text-left text-[0.9375rem] font-semibold transition-colors duration-200 motion-reduce:transition-none"
        >
          <span className="min-w-0 truncate">{activeLabel}</span>
          <ExpandIndicator isExpanded={open} variant="compact" className="theme-text-muted ml-auto shrink-0" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-label="Dev mode tools menu"
          onOpenAutoFocus={(event) => {
            // Land on the current tool, not the first row: the accent focus
            // ring would otherwise contradict the trigger's label.
            event.preventDefault();
            const row = activeRowRef.current;
            if (row) {
              row.focus();
              row.scrollIntoView({ block: "center" });
            }
          }}
          className="theme-overlay-surface fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border theme-overlay-shadow duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom motion-reduce:animate-none"
        >
          <DialogDescription className="sr-only">
            Choose a tool, open a utility, or leave the editor.
          </DialogDescription>
          <span
            aria-hidden
            className="theme-dev-rail-divider mx-auto mt-1.5 h-1 w-9 shrink-0 rounded-full"
          />
          <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
            <DialogTitle className={`${RAIL_GROUP_CAPTION_CLASS} px-1`}>Tools</DialogTitle>
            <DialogPrimitive.Close
              aria-label="Close tools menu"
              className={`${RAIL_ICON_BUTTON_CLASS} ml-auto`}
            >
              <Icon icon="lucide:x" size={15} />
            </DialogPrimitive.Close>
          </div>
          <nav aria-label="Dev mode tools menu" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-2">
            <SheetToolList
              groups={groups}
              activeTab={activeTab}
              isToolsSection={isToolsSection}
              activeRowRef={activeRowRef}
              onTabChange={closeThen(onTabChange)}
            />
          </nav>
          <div className="theme-divider shrink-0 border-t px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div role="group" aria-label="Site sections" className="flex flex-col gap-0.5">
              <span aria-hidden className={`${RAIL_GROUP_CAPTION_CLASS} px-3 pb-1 pt-1`}>
                More
              </span>
              <button
                type="button"
                ref={changeLogActive ? (activeRowRef as RefObject<HTMLButtonElement>) : undefined}
                disabled={changeLogLockReason !== null}
                aria-disabled={changeLogLockReason !== null ? "true" : undefined}
                title={changeLogLockReason ?? undefined}
                aria-current={changeLogActive ? "page" : undefined}
                data-state={changeLogActive ? "active" : "inactive"}
                onClick={() => closeThen(onPrimaryTabChange)("change-log")}
                className={SHEET_TAB_CLASS}
              >
                Change log
              </button>
              {DEV_UTILITIES.map((utility) => (
                <Link key={utility.href} href={utility.href} className={SHEET_TAB_CLASS}>
                  <Icon icon={utility.icon} size={16} className="theme-accent-emphasis shrink-0" />
                  {utility.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => closeThen(onLeave)(undefined)}
                className={SHEET_TAB_CLASS}
              >
                <Icon icon="lucide:x" size={16} className="shrink-0" />
                Leave editor
              </button>
            </div>
            <div role="group" aria-label="Session" className="mt-1 flex items-center gap-2 px-3 pt-2">
              {session}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

/**
 * One slim toolbar, desktop-app style: a wrench mark, the Content group as
 * inline pills, Intake and Site as dropdown menus with rolled-up badges, a
 * Locked overflow for tools above the signed-in role, then a trailing cluster
 * with the secondary destinations (Change log, utilities), Leave editor, and
 * the session controls. The rail is always one row: the strip scrolls
 * sideways inside its own box and keeps the active tab (or the menu holding
 * it) in view, while the trailing cluster stays put. Under `md` the whole
 * rail gives way to a single 44px bar whose tool button opens a bottom sheet
 * with every group.
 */
export function DevModePageChrome({
  activePrimaryTab,
  activeTab,
  isSignedIn,
  role,
  sessionStatus,
  userEmail,
  userName,
  onPrimaryTabChange,
  onTabChange,
  onSignIn,
  onLeave,
}: DevModePageChromeProps) {
  const userLabel = userName ?? userEmail ?? "Editor";
  const isToolsSection = activePrimaryTab === "tools";
  const mayDraft = canDraft(role);
  // Each badge is only asked for by a role that may open its tab.
  const badgeCounts = useDevRailBadges(role);
  const toolGroups = TOOL_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.map(({ id, label, role, destination, badge }): ToolTabItem => ({
      id,
      label,
      role,
      destination,
      badge: badge === undefined ? undefined : badgeCounts[badge],
    })),
  }));
  // Until the session answers, the role is unknown rather than absent: hold the
  // rail's shape and let the tabs wait instead of filing them all under Locked.
  const pendingReason = sessionStatus === "loading" ? "Checking your account" : null;
  const roleGroups = splitGroupsByRole(toolGroups, role, pendingReason);
  const lockedTools = roleGroups.flatMap((group) => group.locked);
  const changeLogLockReason =
    pendingReason ?? getRoleFloorLockReason(role, findDevTab("change-log").role);
  const activeLabel = activePrimaryTab === "change-log" ? "Change log" : findDevTab(activeTab).label;
  const sessionDetail = mayDraft
    ? "Signed in. You can edit articles."
    : "Signed in. You can edit your own contributor record from the Contributors tab.";

  // The strip only scrolls as far as it must: an active tab already in view
  // leaves the scroll position alone, one past an edge is brought in with a
  // little of its neighbour, so the row never jumps on every tab change. The
  // first tab of a group brings its caption along, so the group is never
  // shown headless. The reveal re-runs whenever badge counts arrive (they
  // widen pills) and once more after fonts settle, so a deep-linked tool can
  // never be stranded past the edge.
  const stripRef = useRef<HTMLElement | null>(null);
  const revealActive = useCallback(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-current="page"], [data-active]');
    if (!strip || !active) {
      return;
    }
    const group = active.parentElement;
    const leadsGroup = group instanceof HTMLElement && group.querySelector("button, a") === active;
    const start = (leadsGroup ? group.offsetLeft : active.offsetLeft) - RAIL_SCROLL_MARGIN_PX;
    const end = active.offsetLeft + active.offsetWidth + RAIL_SCROLL_MARGIN_PX;
    if (start < strip.scrollLeft) {
      strip.scrollLeft = Math.max(0, start);
    } else if (end > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = end - strip.clientWidth;
    }
  }, []);
  useEffect(() => {
    revealActive();
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) {
        revealActive();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [revealActive, activeTab, isToolsSection, badgeCounts]);

  // Which edges hide more tabs. Drives the fades and the paging buttons, so a
  // mouse without a horizontal wheel can still reach every group.
  const [edges, setEdges] = useState({ start: false, end: false });
  const syncEdges = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    const next = {
      start: strip.scrollLeft > RAIL_EDGE_SLACK_PX,
      end: strip.scrollLeft < maxScroll - RAIL_EDGE_SLACK_PX,
    };
    setEdges((previous) =>
      previous.start === next.start && previous.end === next.end ? previous : next);
  }, []);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    syncEdges();
    revealActive();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncEdges);
      return () => window.removeEventListener("resize", syncEdges);
    }
    const observer = new ResizeObserver(() => {
      syncEdges();
      // Any width change (badges arriving, window resize) can strand the
      // active pill past an edge; re-check it here so the rail self-heals.
      revealActive();
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, [syncEdges, revealActive]);
  const pageStrip = (direction: -1 | 1) => {
    const strip = stripRef.current;
    if (strip) {
      strip.scrollLeft += direction * strip.clientWidth * RAIL_SCROLL_PAGE_RATIO;
    }
  };

  const sessionControls =
    sessionStatus === "loading" ? (
      <span className="theme-text-muted flex items-center gap-1.5 text-xs">
        <Icon icon="lucide:loader-2" size={14} className="theme-accent-emphasis animate-spin" />
        <span className="sr-only">Loading authentication</span>
      </span>
    ) : isSignedIn ? (
      <>
        <span
          title={sessionDetail}
          className="theme-dev-rail-user flex min-w-0 flex-1 items-baseline gap-1.5 text-[0.75rem] font-semibold tracking-wide uppercase md:flex-none"
        >
          <span className="sr-only">Signed in as </span>
          <span className="max-w-[10rem] truncate">{userLabel}</span>
          <span className="theme-text-muted text-[0.625rem] font-medium normal-case tracking-normal">
            {getRoleDisplayName(role)}
          </span>
        </span>
        <button
          type="button"
          title="Sign out"
          aria-label="Sign out"
          onClick={() => void signOut({ callbackUrl: "/sign-in" })}
          className={RAIL_ICON_BUTTON_CLASS}
        >
          <Icon icon="lucide:log-out" size={15} />
        </button>
      </>
    ) : (
      <Button
        variant="accent"
        size="xs"
        className="h-7 rounded-md px-3"
        onClick={onSignIn}
        title="Sign in before saving changes or using protected actions."
      >
        <Icon icon="lucide:log-in" size={14} />
        Sign in
      </Button>
    );

  // A rail group renders inline when it is the Content head, or when the role
  // leaves so few tools that the whole rail fits flat; larger groups become
  // menus. Empty groups (every tool locked) disappear into the Locked menu.
  const railGroups = roleGroups.filter((group) => group.enabled.length > 0);
  const enabledTotal = railGroups.reduce((sum, group) => sum + group.enabled.length, 0);
  const keepFlat = enabledTotal <= INLINE_RAIL_TOTAL_LIMIT;

  return (
    <div className="w-full">
      <DevSurfaceTitle />

      {/* Phone: one bar, tools behind a sheet. */}
      <div className="theme-dev-rail flex min-h-11 w-full items-center gap-1 rounded-lg border px-1.5 py-1 md:hidden">
        <span
          aria-hidden
          className="theme-accent-emphasis flex h-7 w-7 shrink-0 items-center justify-center"
          title="Dev Tools"
        >
          <Icon icon="lucide:wrench" size={16} className="text-current" />
        </span>
        <DevToolSheet
          groups={roleGroups}
          activeTab={activeTab}
          isToolsSection={isToolsSection}
          onTabChange={onTabChange}
          activePrimaryTab={activePrimaryTab}
          activeLabel={activeLabel}
          changeLogLockReason={changeLogLockReason}
          onPrimaryTabChange={onPrimaryTabChange}
          onLeave={onLeave}
          session={sessionControls}
        />
        <button
          type="button"
          title="Leave editor"
          aria-label="Leave editor"
          onClick={onLeave}
          className={RAIL_ICON_BUTTON_CLASS}
        >
          <Icon icon="lucide:x" size={15} />
        </button>
      </div>

      {/* Tablet and up: the one-row rail. */}
      <div className={RAIL_CLASS}>
        <span
          aria-hidden
          className="theme-accent-emphasis flex h-7 w-7 shrink-0 items-center justify-center"
          title="Dev Tools"
        >
          <Icon icon="lucide:wrench" size={16} className="text-current" />
        </span>

        {/* Both pagers keep their slot so the strip never shifts when one appears. */}
        <button
          type="button"
          aria-label="Show earlier tools"
          disabled={!edges.start}
          onClick={() => pageStrip(-1)}
          className={`${RAIL_ICON_BUTTON_CLASS} ${edges.start ? "" : "invisible"}`}
        >
          <Icon icon="lucide:chevron-left" size={15} />
        </button>
        <nav
          ref={stripRef}
          aria-label="Dev mode tools"
          onScroll={syncEdges}
          data-scroll-start={edges.start ? "" : undefined}
          data-scroll-end={edges.end ? "" : undefined}
          className={RAIL_STRIP_CLASS}
        >
          {railGroups.map((group, index) => {
            const inline = group.id === "content" || keepFlat;
            return inline ? (
              <RailInlineGroup
                label={group.label}
                tabs={group.enabled}
                activeTab={activeTab}
                isToolsSection={isToolsSection}
                onTabChange={onTabChange}
                showDivider={index > 0}
              />
            ) : (
              <RailGroupMenu
                key={group.id}
                label={group.label}
                tabs={group.enabled}
                activeTab={activeTab}
                isToolsSection={isToolsSection}
                onTabChange={onTabChange}
                showDivider={index > 0}
              />
            );
          })}
          {lockedTools.length > 0 ? <RailLockedMenu locked={lockedTools} /> : null}
        </nav>
        <button
          type="button"
          aria-label="Show more tools"
          disabled={!edges.end}
          onClick={() => pageStrip(1)}
          className={`${RAIL_ICON_BUTTON_CLASS} ${edges.end ? "" : "invisible"}`}
        >
          <Icon icon="lucide:chevron-right" size={15} />
        </button>

        <RailDivider />

        <nav aria-label="Dev mode sections" className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            disabled={changeLogLockReason !== null}
            aria-disabled={changeLogLockReason !== null ? "true" : undefined}
            title={changeLogLockReason ?? undefined}
            aria-current={activePrimaryTab === "change-log" ? "page" : undefined}
            data-state={activePrimaryTab === "change-log" ? "active" : "inactive"}
            onClick={() => onPrimaryTabChange("change-log")}
            className={RAIL_TAB_CLASS}
          >
            Change log
          </button>
        </nav>

        <RailDivider />

        <div className="flex min-w-0 items-center gap-1">
          <DevUtilitiesMenu />
          <button
            type="button"
            title="Leave editor"
            aria-label="Leave editor"
            onClick={onLeave}
            className={RAIL_ICON_BUTTON_CLASS}
          >
            <Icon icon="lucide:x" size={15} />
          </button>
          <RailDivider />
          {sessionControls}
        </div>
      </div>
    </div>
  );
}
