"use client";

import { signOut } from "next-auth/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { isBareCommandKey, isDialogOpen, useDevShortcutList } from "../components/devShortcuts";
import { useUnsavedWorkRegistry } from "../components/unsavedWork";
import { clearDraftRecovery } from "../recovery/draftRecovery";
import { canDraft, getRoleDisplayName, getRoleFloorLockReason, type AppRole } from "@/lib/auth/roles";
import { DevCommandPalette } from "./DevCommandPalette";
import type { PaletteRecord, PaletteTool } from "./devCommandPaletteModel";
import type { DevModePrimaryTab } from "./devModePageUtils";
import { DevShortcutSheet } from "./DevShortcutSheet";
import {
  DEV_TAB_REGISTRY,
  findDevTab,
  INBOX_ROLLUP_BADGE,
  type DevModeTab,
  type DevTabDescriptor,
  type DevToolGroup,
} from "./devTabRegistry";
import { DevUtilitiesMenu, devUtilitiesFor } from "./DevUtilitiesMenu";
import {
  INLINE_RAIL_TOTAL_LIMIT,
  RAIL_CLASS,
  RAIL_EDGE_SLACK_PX,
  RAIL_ICON_BUTTON_CLASS,
  RAIL_SCROLL_MARGIN_PX,
  RAIL_SCROLL_PAGE_RATIO,
  RAIL_STRIP_CLASS,
  RAIL_TAB_CLASS,
  RailDivider,
  RailGroupMenu,
  RailInlineGroup,
  RailLockedMenu,
} from "./DevModeToolRail";
import { DevToolSheet } from "./DevModeToolSheet";
import type {
  DevModePageChromeProps,
  GroupView,
  LockedToolItem,
  ToolTabItem,
} from "./DevModeToolTypes";
import { useDevRailBadges } from "./useDevRailBadges";

/**
 * Rail groups in display order, each holding its descriptors in registry
 * order. Role projection remains in the chrome because it is access policy.
 */
const TOOL_GROUPS: readonly { id: DevToolGroup; label: string; tabs: readonly DevTabDescriptor[] }[] = (
  [
    { id: "entry", label: "Start" },
    { id: "content", label: "Content" },
    { id: "intake", label: "Intake" },
    { id: "site", label: "Site" },
  ] as const
).map((group) => ({ ...group, tabs: DEV_TAB_REGISTRY.filter((tab) => tab.group === group.id) }));


/**
 * The dev surface's own page title. The visible headings belong to the tools
 * themselves; this one exists so the landmark structure and the document
 * outline always have a level-one anchor, and so screen-reader users hear
 * where they are before the rail.
 */
function DevSurfaceTitle() {
  return <h1 className="sr-only">Dev Tools</h1>;
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
 * Splits every group's tabs by the signed-in role. External launchers (Review)
 * follow the same floor: the destination enforces its own gate too, but the
 * rail never offers a link the role would bounce off.
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


/**
 * One slim toolbar, desktop-app style: a wrench mark, the Content group as
 * inline pills, Intake and Site as dropdown menus with rolled-up badges, a
 * Locked overflow for tools above the signed-in role, then a trailing cluster
 * with the secondary destinations (Change log, the Cmd+K palette, utilities), Leave editor, and
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
  onPrimaryTabChange: requestPrimaryTabChange,
  onTabChange: requestTabChange,
  onOpenPath: requestOpenPath,
  glossaryLocales,
  onSignIn,
  onLeave: requestLeave,
}: DevModePageChromeProps) {
  // Every way out of the open tool asks the unsaved-work registry first: a
  // rail switch drops the tool's own drafts, Leave and sign-out drop the
  // shared draft too.
  const unsavedWork = useUnsavedWorkRegistry();
  const { confirmExit } = unsavedWork;
  const onTabChange = useCallback(
    (tab: DevModeTab) => {
      if (tab === activeTab && activePrimaryTab === "tools") {
        requestTabChange(tab);
        return;
      }
      confirmExit(() => requestTabChange(tab), "tab");
    },
    [activePrimaryTab, activeTab, confirmExit, requestTabChange],
  );
  const onPrimaryTabChange = useCallback(
    (tab: DevModePrimaryTab) => {
      if (tab === activePrimaryTab) {
        requestPrimaryTabChange(tab);
        return;
      }
      confirmExit(() => requestPrimaryTabChange(tab), "tab");
    },
    [activePrimaryTab, confirmExit, requestPrimaryTabChange],
  );
  const onLeave = useCallback(() => confirmExit(requestLeave, "leave"), [confirmExit, requestLeave]);
  // Signing out also clears this browser's draft recovery copies: the next
  // person at this machine must not be offered them.
  const onSignOut = useCallback(
    () => confirmExit(() => {
      clearDraftRecovery();
      void signOut({ callbackUrl: "/sign-in" });
    }, "leave"),
    [confirmExit],
  );

  // Cmd+K and `?`. What the palette opens goes through the same registry
  // question as a rail click: a tool or a record elsewhere drops the open
  // tool's drafts, and a record in the open tool remounts it.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const toolShortcuts = useDevShortcutList();
  const openTool = useCallback((tool: PaletteTool) => {
    setPaletteOpen(false);
    const { href } = tool;
    if (href) {
      confirmExit(() => window.location.assign(href), "leave");
    } else {
      onTabChange(tool.tab);
    }
  }, [confirmExit, onTabChange]);
  const openRecord = useCallback((record: PaletteRecord) => {
    setPaletteOpen(false);
    confirmExit(() => {
      if (requestOpenPath) requestOpenPath(record.href);
      else window.location.assign(record.href);
    }, "tab");
  }, [confirmExit, requestOpenPath]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        // Cmd+K works from a text field too, but never over another dialog.
        if (!paletteOpen && isDialogOpen()) return;
        event.preventDefault();
        setPaletteOpen((current) => !current);
        return;
      }
      if (event.key === "?" && isBareCommandKey(event)) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen]);

  const userLabel = userName ?? userEmail ?? "Editor";
  const isToolsSection = activePrimaryTab === "tools";
  const mayDraft = canDraft(role);
  // Each badge is only asked for by a role that may open its tab.
  const badgeCounts = useDevRailBadges(role, userEmail);
  const toolGroups = TOOL_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.map(({ id, label, labelFor, role: floor, destination, badge }): ToolTabItem => ({
      id,
      label: labelFor?.(role) ?? label,
      role: floor,
      destination,
      badge: badge === undefined ? undefined : badgeCounts[badge],
      rollsUpIntake: badge === INBOX_ROLLUP_BADGE || undefined,
      unsaved: unsavedWork.isDirty(id) || undefined,
    })),
  }));
  // Until the session answers, the role is unknown rather than absent: hold the
  // rail's shape and let the tabs wait instead of filing them all under Locked.
  const pendingReason = sessionStatus === "loading" ? "Checking your account" : null;
  const roleGroups = splitGroupsByRole(toolGroups, role, pendingReason);
  const changeLogDescriptor = findDevTab("change-log");
  const changeLogRoleReason = pendingReason === null
    ? getRoleFloorLockReason(role, changeLogDescriptor.role)
    : null;
  const changeLogLockReason = pendingReason ?? changeLogRoleReason;
  // A Change log the role cannot open joins the Locked menu, where its reason
  // is text, instead of sitting in the cluster as a dead button.
  const lockedTools: LockedToolItem[] = [
    ...roleGroups.flatMap((group) => group.locked),
    ...(changeLogRoleReason === null
      ? []
      : [{
          id: changeLogDescriptor.id,
          label: changeLogDescriptor.label,
          role: changeLogDescriptor.role,
          destination: changeLogDescriptor.destination,
          reason: changeLogRoleReason,
        }]),
  ];
  const utilities = devUtilitiesFor(role);
  const activeDescriptor = findDevTab(activeTab);
  const activeLabel = activePrimaryTab === "change-log"
    ? "Change log"
    : activeDescriptor.labelFor?.(role) ?? activeDescriptor.label;
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
          onClick={onSignOut}
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
  // When the role has the Inbox, its one count already covers every intake
  // queue, so the group menus stop rolling up the same items a second time.
  // The tools inside each menu keep their own counts. Home shares the Start
  // group with it but counts nothing, so it does not stop the roll-up.
  const entryShown = railGroups.some((group) => group.enabled.some((tab) => tab.rollsUpIntake));

  const paletteButton = (
    <button
      type="button"
      title="Open any tool or record (Cmd+K)"
      aria-label="Open any tool or record"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => setPaletteOpen(true)}
      className={RAIL_ICON_BUTTON_CLASS}
    >
      <Icon icon="lucide:search" size={15} />
    </button>
  );

  return (
    <div className="w-full">
      <DevSurfaceTitle />
      <DevCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        role={pendingReason === null ? role : null}
        glossaryLocales={glossaryLocales}
        onOpenTool={openTool}
        onOpenRecord={openRecord}
      />
      <DevShortcutSheet
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        toolLabel={activeLabel}
        shortcuts={toolShortcuts}
      />

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
          utilities={utilities}
          onPrimaryTabChange={onPrimaryTabChange}
          onLeave={onLeave}
          session={sessionControls}
        />
        {paletteButton}
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
            const inline = group.id === "entry" || group.id === "content" || keepFlat;
            return inline ? (
              <RailInlineGroup
                key={group.id}
                label={group.label}
                tabs={group.enabled}
                activeTab={activeTab}
                isToolsSection={isToolsSection}
                onTabChange={onTabChange}
                showDivider={index > 0}
                showCaption={group.id !== "entry"}
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
                rollUpBadges={!entryShown}
              />
            );
          })}
          {lockedTools.length > 0 ? <RailLockedMenu locked={lockedTools} /> : null}
          {pendingReason !== null ? (
            <span role="status" className="theme-text-muted shrink-0 whitespace-nowrap px-2 text-xs">
              {pendingReason}
            </span>
          ) : null}
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

        {changeLogRoleReason === null ? (
          <>
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
          </>
        ) : null}

        <RailDivider />

        <div className="flex min-w-0 items-center gap-1">
          {paletteButton}
          {utilities.length > 0 ? <DevUtilitiesMenu utilities={utilities} /> : null}
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
