"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
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
type ToolTabItem = Pick<DevTabDescriptor, "id" | "label" | "role" | "destination"> & { badge?: number };

/**
 * Rail groups in display order, each holding its descriptors in registry
 * order. Text-only tabs: with this many destinations in one rail an icon per
 * tab is noise, not wayfinding; the labels already name the tools, and the
 * violet selected treatment carries the "you are here". The one exception is
 * the outward arrow on the external launcher, which marks a page change.
 */
const TOOL_GROUPS: readonly { id: DevToolGroup; label: string; tabs: readonly DevTabDescriptor[] }[] = (
  [
    { id: "content", label: "Content" },
    { id: "intake", label: "Intake" },
    { id: "site", label: "Site" },
  ] as const
).map((group) => ({
  ...group,
  tabs: DEV_TAB_REGISTRY.filter((tab) => tab.group === group.id),
}));

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type DevModePageChromeProps = {
  activePrimaryTab: DevModePrimaryTab;
  activeTab: DevModeTab;
  /** An Auth.js session is present. */
  isSignedIn: boolean;
  /** The session role, null while signed out; every tab above it renders disabled with a reason. */
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
 * The tablet-and-up rail is one row at every width: the tool strip scrolls
 * sideways inside its own box and the trailing cluster never leaves the row.
 * Under `md` the rail is replaced by a single bar whose button opens `DevToolSheet`.
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

const RAIL_GROUP_CAPTION_CLASS =
  "theme-dev-rail-group shrink-0 select-none px-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em]";

const RAIL_ICON_BUTTON_CLASS =
  `theme-dev-rail-button flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-200 motion-reduce:transition-none ${TOUCH_ICON}`;

/**
 * The dev surface's own page title. The visible headings belong to the tools
 * themselves ("Replication Studio", "Tag Editor"), so the shell keeps only an
 * assistive-technology h1 instead of spending a full row on a wrench and the
 * words "Dev Tools".
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
 * The same waiting card, rendered *inside* the shell rather than instead of it.
 * The tab rail stays interactive so a tool that needs nothing from the corpus is
 * one click away while the drain finishes; it doubles as the fallback for the
 * lazily-loaded tool bundles.
 */
export function DevToolLoadingPanel({ label = "Loading tool" }: { label?: string }) {
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <StateCard
        icon="lucide:wrench"
        tone="accent"
        loading
        align="center"
        title={label}
        description="Pulling the latest data into the editor. This only takes a moment."
      />
    </div>
  );
}

type ToolGroupItems = { id: DevToolGroup; label: string; tabs: readonly ToolTabItem[] };

type ToolTabListProps = {
  groups: readonly ToolGroupItems[];
  activeTab: DevModeTab;
  isToolsSection: boolean;
  role: AppRole | null;
  onTabChange: (tab: DevModeTab) => void;
  /** Rail: inline pills. Sheet: full-width rows. */
  layout: "rail" | "sheet";
};

/**
 * The three captioned groups, rendered once for the rail and once for the
 * sheet so both share one iteration of the registry, one badge placement, and
 * one lock-reason rule. In the rail a group is one unbreakable run (caption,
 * then its tabs) separated from the next by a divider, so a caption can never
 * drift from the tabs it names.
 */
function ToolTabList({ groups, activeTab, isToolsSection, role, onTabChange, layout }: ToolTabListProps) {
  const isRail = layout === "rail";
  const tabClass = isRail ? RAIL_TAB_CLASS : SHEET_TAB_CLASS;
  return (
    <>
      {groups.map((group, index) => (
        <div
          key={group.id}
          role="group"
          aria-label={group.label}
          className={isRail ? "flex shrink-0 items-center gap-0.5" : "flex flex-col gap-0.5"}
        >
          {isRail && index > 0 ? <RailDivider /> : null}
          <span aria-hidden className={isRail ? RAIL_GROUP_CAPTION_CLASS : `${RAIL_GROUP_CAPTION_CLASS} px-3 pb-1 pt-2`}>
            {group.label}
          </span>
          {group.tabs.map((item) => {
            const badge = item.badge ? (
              <span
                title={`${item.badge} awaiting review`}
                className="theme-portal-count-badge inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold leading-none"
              >
                {item.badge}
              </span>
            ) : null;
            if (item.destination.kind === "external") {
              return (
                <a
                  key={item.id}
                  href={item.destination.href}
                  title={`Opens ${item.label} full screen`}
                  className={`${tabClass} ${isRail ? "inline-flex items-center gap-1" : ""}`}
                >
                  {item.label}
                  <Icon icon="lucide:arrow-up-right" size={12} className="text-current" />
                  {badge}
                </a>
              );
            }
            const isActive = isToolsSection && activeTab === item.id;
            const lockReason = getRoleFloorLockReason(role, item.role);
            return (
              <button
                key={item.id}
                type="button"
                disabled={lockReason !== null}
                aria-disabled={lockReason !== null ? "true" : undefined}
                title={lockReason ?? undefined}
                aria-current={isActive ? "page" : undefined}
                data-state={isActive ? "active" : "inactive"}
                onClick={() => onTabChange(item.id)}
                className={`${tabClass} ${isRail ? "inline-flex items-center gap-1.5" : ""}`}
              >
                {item.label}
                {badge}
                {!isRail && lockReason ? (
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

type DevToolSheetProps = Omit<ToolTabListProps, "layout"> & {
  activePrimaryTab: DevModePrimaryTab;
  activeLabel: string;
  changeLogLockReason: string | null;
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onLeave: () => void;
  /** Sign-in / sign-out controls; the phone bar hosts them here instead of beside the tool button. */
  session: ReactNode;
};

/**
 * Phone tool menu: a bottom sheet holding the same three groups as the rail,
 * then Change log, the utility routes, and Leave editor. Selecting anything
 * closes it.
 */
function DevToolSheet({
  activePrimaryTab,
  activeLabel,
  changeLogLockReason,
  onPrimaryTabChange,
  onTabChange,
  onLeave,
  session,
  ...listProps
}: DevToolSheetProps) {
  const [open, setOpen] = useState(false);
  const closeThen = <T,>(action: (value: T) => void) => (value: T) => {
    setOpen(false);
    action(value);
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Tools menu, current tool ${activeLabel}`}
          className="theme-dev-rail-tab flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-3 text-left text-[0.9375rem] font-semibold transition-colors duration-200 motion-reduce:transition-none"
        >
          <span className="min-w-0 truncate">{activeLabel}</span>
          <Icon icon="lucide:chevrons-up-down" size={16} className="theme-text-muted ml-auto shrink-0" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-label="Dev mode tools menu"
          className="theme-overlay-surface fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] theme-overlay-shadow duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom motion-reduce:animate-none"
        >
          <DialogTitle className="sr-only">Dev tools</DialogTitle>
          <DialogPrimitive.Description className="sr-only">
            Choose a tool, open a utility, or leave the editor.
          </DialogPrimitive.Description>
          <nav aria-label="Dev mode tools menu" className="flex flex-col gap-1">
            <ToolTabList {...listProps} onTabChange={closeThen(onTabChange)} layout="sheet" />
            <div role="group" aria-label="Site sections" className="flex flex-col gap-0.5">
              <span aria-hidden className={`${RAIL_GROUP_CAPTION_CLASS} px-3 pb-1 pt-2`}>
                More
              </span>
              <button
                type="button"
                disabled={changeLogLockReason !== null}
                aria-disabled={changeLogLockReason !== null ? "true" : undefined}
                title={changeLogLockReason ?? undefined}
                aria-current={activePrimaryTab === "change-log" ? "page" : undefined}
                data-state={activePrimaryTab === "change-log" ? "active" : "inactive"}
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
            <div role="group" aria-label="Session" className="mt-1 flex items-center gap-2 theme-divider border-t px-3 pt-3">
              {session}
            </div>
          </nav>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

/**
 * One slim toolbar, desktop-app style: a wrench mark, the tool tabs in three
 * captioned groups, then a trailing cluster with the secondary destinations
 * (Change log, utilities), Leave editor, and the session controls. The rail
 * is always one row: the groups sit in a strip that scrolls sideways inside
 * its own box and keeps the active tab in view, while the trailing cluster
 * stays put. Under `md` the whole rail gives way to a single 44px bar whose
 * tool button opens a bottom sheet with the same groups.
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
  const changeLogLockReason = getRoleFloorLockReason(role, findDevTab("change-log").role);
  const activeLabel = activePrimaryTab === "change-log" ? "Change log" : findDevTab(activeTab).label;
  const sessionDetail = mayDraft
    ? "Signed in. You can edit articles."
    : "Signed in. You can edit your own contributor record from the Contributors tab.";

  // The strip only scrolls as far as it must: an active tab already in view
  // leaves the scroll position alone, one past an edge is brought in with a
  // little of its neighbour, so the row never jumps on every tab change. The
  // first tab of a group brings its caption along, so the group is never
  // shown headless.
  const stripRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-current="page"]');
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
  }, [activeTab, isToolsSection]);

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
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncEdges);
      return () => window.removeEventListener("resize", syncEdges);
    }
    const observer = new ResizeObserver(syncEdges);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [syncEdges]);
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

  const listProps = { groups: toolGroups, activeTab, isToolsSection, role, onTabChange };

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
          {...listProps}
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
          <ToolTabList {...listProps} layout="rail" />
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
