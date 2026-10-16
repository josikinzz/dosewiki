"use client";

import { signOut } from "next-auth/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { useConfirm } from "../components/ConfirmDialog";
import { isBareCommandKey, isDialogOpen, useDevShortcutList } from "../components/devShortcuts";
import { useUnsavedWorkRegistry } from "../components/unsavedWork";
import { clearDraftRecovery } from "../recovery/draftRecovery";
import { canDraft, getRoleDisplayName, getRoleFloorLockReason, type AppRole } from "@/lib/auth/roles";
import { DevAccountMenu, AccountAvatar } from "./DevAccountMenu";
import { DevCommandPalette, usePaletteKeyLabel, type PaletteToolState } from "./DevCommandPalette";
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
import { devUtilitiesFor } from "./devUtilities";
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
  ToolGlyph,
} from "./DevModeToolRail";
import { DevToolSheet } from "./DevModeToolSheet";
import type {
  DevModePageChromeProps,
  GroupView,
  LockedToolItem,
  ToolTabItem,
} from "./DevModeToolTypes";
import { useDevRailBadgeReadings, useDevRailBadges } from "./useDevRailBadges";

const TOOL_GROUPS: readonly { id: DevToolGroup; label: string; tabs: readonly DevTabDescriptor[] }[] = (
  [
    { id: "entry", label: "Start" },
    { id: "content", label: "Content" },
    { id: "intake", label: "Intake" },
    { id: "site", label: "Site" },
  ] as const
).map((group) => ({ ...group, tabs: DEV_TAB_REGISTRY.filter((tab) => tab.group === group.id) }));

function DevSurfaceTitle() {
  return <h1 className="sr-only">Editor</h1>;
}

export function DevToolLoadingPanel({ label = "Loading tool" }: { label?: string }) {
  return (
    <StateCard
      loading
      compact
      className="mt-10"
      title={label}
      footer={
        <span className="theme-loading-stalled-label block whitespace-nowrap">
          Still loading. Refresh if nothing appears.
        </span>
      }
    />
  );
}

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

export function DevModePageChrome({
  activePrimaryTab,
  activeTab,
  isSignedIn,
  role,
  sessionStatus,
  userEmail,
  userImage,
  userName,
  onPrimaryTabChange: requestPrimaryTabChange,
  onTabChange: requestTabChange,
  onOpenPath: requestOpenPath,
  glossaryLocales,
  onSignIn,
  onLeave: requestLeave,
}: DevModePageChromeProps) {
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
  const onOpenHref = useCallback(
    (href: string) => confirmExit(() => window.location.assign(href), "leave"),
    [confirmExit],
  );
  const { confirm, dialog: confirmDialog } = useConfirm();
  const hasUnsaved = unsavedWork.dirtyEntries.length > 0;
  const onSignOut = useCallback(() => {
    const signOutNow = () => {
      clearDraftRecovery();
      void signOut({ callbackUrl: "/sign-in" });
    };
    if (hasUnsaved) {
      confirmExit(signOutNow, "leave");
      return;
    }
    confirm({
      title: "Sign out of the editor?",
      description: "Draft recovery copies kept in this browser are cleared, so the next person here is not offered them.",
      confirmLabel: "Sign out",
      onConfirm: signOutNow,
    });
  }, [confirm, confirmExit, hasUnsaved]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const toolShortcuts = useDevShortcutList();
  const paletteKey = usePaletteKeyLabel();
  const openTool = useCallback((tool: PaletteTool) => {
    setPaletteOpen(false);
    const { href } = tool;
    if (href) {
      onOpenHref(href);
    } else {
      onTabChange(tool.tab);
    }
  }, [onOpenHref, onTabChange]);
  const openRecord = useCallback((record: PaletteRecord) => {
    setPaletteOpen(false);
    if (!record.href.startsWith("/dev")) {
      onOpenHref(record.href);
      return;
    }
    confirmExit(() => {
      if (requestOpenPath) requestOpenPath(record.href);
      else window.location.assign(record.href);
    }, "tab");
  }, [confirmExit, onOpenHref, requestOpenPath]);
  const showShortcuts = useCallback(() => {
    setPaletteOpen(false);
    setShortcutsOpen(true);
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
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
  const badgeCounts = useDevRailBadges(role, userEmail);
  const readings = useDevRailBadgeReadings();
  const staleBadges = new Set<string>();
  let inboxFloor = false;
  for (const [badge, reading] of Object.entries(readings ?? {})) {
    if (!reading?.failed) continue;
    if (reading.count === null) {
      inboxFloor = true;
    } else {
      staleBadges.add(badge);
      staleBadges.add(INBOX_ROLLUP_BADGE);
    }
  }
  const toolGroups = TOOL_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.map(({ id, label, labelFor, icon, role: floor, destination, badge }): ToolTabItem => ({
      id,
      label: labelFor?.(role) ?? label,
      icon,
      role: floor,
      destination,
      badge: badge === undefined ? undefined : badgeCounts[badge],
      stale: (badge !== undefined && staleBadges.has(badge)) || undefined,
      atLeast: (badge === INBOX_ROLLUP_BADGE && inboxFloor) || undefined,
      rollsUpIntake: badge === INBOX_ROLLUP_BADGE || undefined,
      unsaved: unsavedWork.isDirty(id) || undefined,
    })),
  }));
  const pendingReason = sessionStatus === "loading" ? "Checking your account" : null;
  const roleGroups = splitGroupsByRole(toolGroups, role, pendingReason);
  const changeLogDescriptor = findDevTab("change-log");
  const changeLogRoleReason = pendingReason === null
    ? getRoleFloorLockReason(role, changeLogDescriptor.role)
    : null;
  const changeLogLockReason = pendingReason ?? changeLogRoleReason;
  const lockedTools: LockedToolItem[] = [
    ...roleGroups.flatMap((group) => group.locked),
    ...(changeLogRoleReason === null
      ? []
      : [{
          id: changeLogDescriptor.id,
          label: changeLogDescriptor.label,
          icon: changeLogDescriptor.icon,
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
  const activeIcon = activePrimaryTab === "change-log" ? changeLogDescriptor.icon : activeDescriptor.icon;
  const ability = mayDraft
    ? "You can edit articles."
    : role === "translator"
      ? "You can review and approve glossary renderings in your languages."
      : "You can edit your own contributor record from the Contributors tab.";

  const enabledItems = roleGroups.flatMap((group) => group.enabled);
  const inboxItem = enabledItems.find((item) => item.rollsUpIntake);
  const attentionItems = inboxItem ? [inboxItem] : enabledItems;
  const attention = attentionItems.reduce((sum, item) => sum + (item.badge ?? 0), 0) || undefined;
  const attentionStale = attentionItems.some((item) => item.stale && item.badge) || undefined;
  const attentionAtLeast = attentionItems.some((item) => item.atLeast && item.badge) || undefined;
  const unsavedAnywhere = hasUnsaved || undefined;

  const paletteToolState: Partial<Record<DevModeTab, PaletteToolState>> = {};
  for (const group of roleGroups) {
    for (const item of group.enabled) {
      paletteToolState[item.id] = { icon: item.icon, group: group.label, badge: item.badge, stale: item.stale, atLeast: item.atLeast, unsaved: item.unsaved };
    }
  }
  paletteToolState[changeLogDescriptor.id] = { icon: changeLogDescriptor.icon, group: "More" };

  const stripRef = useRef<HTMLElement | null>(null);
  const revealActive = useCallback(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-current="page"], [data-active]');
    if (!strip || !active) {
      return;
    }
    const start = active.offsetLeft - RAIL_SCROLL_MARGIN_PX;
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
  const overflowing = edges.start || edges.end;

  const accountMenu = isSignedIn && sessionStatus !== "loading" ? (
    <DevAccountMenu
      userLabel={userLabel}
      userEmail={userEmail}
      userImage={userImage}
      roleName={getRoleDisplayName(role)}
      ability={ability}
      utilities={utilities}
      onShowShortcuts={showShortcuts}
      onOpenHref={onOpenHref}
      onSignOut={onSignOut}
    />
  ) : null;

  const sessionPending = (
    <span className="theme-text-muted flex items-center gap-1.5 px-2 text-xs">
      <Icon icon="lucide:loader-2" size={14} className="theme-accent-emphasis animate-spin" />
      <span className="sr-only">Loading authentication</span>
    </span>
  );

  const signInButton = (
    <Button
      variant="accent"
      size="sm"
      className="shrink-0"
      onClick={onSignIn}
      title="Sign in before saving changes or using protected actions."
    >
      <Icon icon="lucide:log-in" size={14} />
      Sign in
    </Button>
  );

  const sheetSession =
    sessionStatus === "loading" ? (
      <span className="theme-text-muted flex min-h-11 items-center gap-2 text-sm">
        <Icon icon="lucide:loader-2" size={16} className="theme-accent-emphasis animate-spin" />
        <span>Checking your account</span>
        <span className="sr-only">Loading authentication</span>
      </span>
    ) : isSignedIn ? (
      <>
        <AccountAvatar label={userLabel} image={userImage} className="h-9 w-9 text-sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="sr-only">Signed in as </span>
          <span className="theme-text-primary truncate text-sm font-semibold">{userLabel}</span>
          <span className="theme-text-muted text-xs">{getRoleDisplayName(role)}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onSignOut} className="shrink-0">
          <Icon icon="lucide:log-out" size={15} />
          Sign out
        </Button>
      </>
    ) : (
      signInButton
    );

  const railGroups = roleGroups.filter((group) => group.enabled.length > 0);
  const enabledTotal = railGroups.reduce((sum, group) => sum + group.enabled.length, 0);
  const keepFlat = enabledTotal <= INLINE_RAIL_TOTAL_LIMIT;
  const entryShown = railGroups.some((group) => group.enabled.some((tab) => tab.rollsUpIntake));

  const leaveButton = (compact: boolean) => (
    <button
      type="button"
      title="Leave editor"
      aria-label="Leave editor"
      onClick={onLeave}
      className={compact ? RAIL_ICON_BUTTON_CLASS : `${RAIL_TAB_CLASS} px-2 2xl:px-2.5`}
    >
      <Icon icon="lucide:door-open" size={16} className="shrink-0" />
      {compact ? null : <span aria-hidden className="hidden 2xl:inline">Leave</span>}
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
        currentTab={isToolsSection ? activeTab : changeLogDescriptor.id}
        toolState={paletteToolState}
        utilities={utilities}
        onOpenTool={openTool}
        onOpenRecord={openRecord}
        onOpenHref={(href) => {
          setPaletteOpen(false);
          onOpenHref(href);
        }}
        onShowShortcuts={showShortcuts}
        onLeave={() => {
          setPaletteOpen(false);
          onLeave();
        }}
        onSignOut={isSignedIn ? () => {
          setPaletteOpen(false);
          onSignOut();
        } : undefined}
      />
      <DevShortcutSheet
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        toolLabel={activeLabel}
        shortcuts={toolShortcuts}
        paletteKey={paletteKey}
      />
      {confirmDialog}

      <div className="theme-dev-rail flex min-h-12 w-full items-center gap-1 rounded-card border p-1 md:hidden">
        <DevToolSheet
          groups={roleGroups}
          locked={lockedTools}
          activeTab={activeTab}
          isToolsSection={isToolsSection}
          onTabChange={onTabChange}
          onOpenHref={onOpenHref}
          activePrimaryTab={activePrimaryTab}
          activeLabel={activeLabel}
          activeIcon={activeIcon}
          attention={attention}
          attentionStale={attentionStale}
          attentionAtLeast={attentionAtLeast}
          unsavedAnywhere={unsavedAnywhere}
          changeLogLockReason={changeLogLockReason}
          utilities={utilities}
          onPrimaryTabChange={onPrimaryTabChange}
          onOpenPalette={() => setPaletteOpen(true)}
          onLeave={onLeave}
          session={sheetSession}
        />
        <button
          type="button"
          title={`Find a tool or record (${paletteKey})`}
          aria-label="Open any tool or record"
          aria-keyshortcuts="Meta+K Control+K"
          onClick={() => setPaletteOpen(true)}
          className={RAIL_ICON_BUTTON_CLASS}
        >
          <Icon icon="lucide:search" size={16} />
        </button>
        {leaveButton(true)}
      </div>

      <div className={RAIL_CLASS}>
        {overflowing ? (
          <button
            type="button"
            aria-label="Show earlier tools"
            disabled={!edges.start}
            onClick={() => pageStrip(-1)}
            className={`${RAIL_ICON_BUTTON_CLASS} ${edges.start ? "" : "invisible"}`}
          >
            <Icon icon="lucide:chevron-left" size={15} />
          </button>
        ) : null}
        <nav
          ref={stripRef}
          aria-label="Editor tools"
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
                onOpenHref={onOpenHref}
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
                onOpenHref={onOpenHref}
                showDivider={index > 0}
                rollUpBadges={!entryShown}
              />
            );
          })}
          {lockedTools.length > 0 ? <RailLockedMenu locked={lockedTools} showDivider={railGroups.length > 0} /> : null}
          {pendingReason !== null ? (
            <span role="status" className="theme-text-muted shrink-0 whitespace-nowrap px-2 text-xs">
              {pendingReason}
            </span>
          ) : null}
        </nav>
        {overflowing ? (
          <button
            type="button"
            aria-label="Show more tools"
            disabled={!edges.end}
            onClick={() => pageStrip(1)}
            className={`${RAIL_ICON_BUTTON_CLASS} ${edges.end ? "" : "invisible"}`}
          >
            <Icon icon="lucide:chevron-right" size={15} />
          </button>
        ) : null}

        {changeLogRoleReason === null ? (
          <>
            <RailDivider />
            <nav aria-label="Editor sections" className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                disabled={changeLogLockReason !== null}
                title={changeLogLockReason ?? undefined}
                aria-current={activePrimaryTab === "change-log" ? "page" : undefined}
                data-state={activePrimaryTab === "change-log" ? "active" : "inactive"}
                onClick={() => onPrimaryTabChange("change-log")}
                className={RAIL_TAB_CLASS}
              >
                <ToolGlyph icon={changeLogDescriptor.icon} className="hidden 2xl:inline-block" />
                Change log
              </button>
            </nav>
          </>
        ) : null}

        <RailDivider />

        <div className="flex min-w-0 shrink-0 items-center gap-1">
          <button
            type="button"
            title={`Find a tool or record (${paletteKey})`}
            aria-label="Open any tool or record"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={() => setPaletteOpen(true)}
            className="theme-dev-rail-search flex h-8 shrink-0 items-center gap-2 rounded-control border px-2 text-sm transition-colors duration-200 motion-reduce:transition-none xl:px-2.5 2xl:w-40 [@media(pointer:coarse)]:min-h-11"
          >
            <Icon icon="lucide:search" size={15} className="shrink-0" />
            <span aria-hidden className="hidden 2xl:inline">Find</span>
            <kbd aria-hidden className="theme-dev-kbd ml-auto hidden xl:inline-flex">{paletteKey}</kbd>
          </button>
          {sessionStatus === "loading" ? sessionPending : isSignedIn ? accountMenu : signInButton}
          <RailDivider className="mx-0.5" />
          {leaveButton(false)}
        </div>
      </div>
    </div>
  );
}
