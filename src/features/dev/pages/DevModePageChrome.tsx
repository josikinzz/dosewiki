"use client";

import { signOut } from "next-auth/react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { canDraft, getRoleDisplayName, getRoleFloorLockReason, type AppRole } from "@/lib/auth/roles";
import type { DevModePrimaryTab } from "./devModePageUtils";
import {
  DEV_TAB_REGISTRY,
  findDevTab,
  type DevModeTab,
  type DevTabDescriptor,
  type DevToolGroup,
} from "./devTabRegistry";
import { DevUtilitiesMenu } from "./DevUtilitiesMenu";
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
};

const RAIL_CLASS =
  "theme-dev-rail flex min-h-10 w-full items-center gap-1 rounded-lg border px-1.5 py-1";

const RAIL_TAB_CLASS =
  "theme-dev-rail-tab shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45 data-[state=active]:font-semibold";

const RAIL_GROUP_CAPTION_CLASS =
  "theme-dev-rail-group shrink-0 select-none px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em]";

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

/**
 * One slim toolbar, desktop-app style: a wrench mark, the tool tabs in three
 * captioned groups, then a trailing cluster with the secondary destinations
 * (Change log, Profile) and the session controls. Groups that do not fit on
 * the first row wrap onto a second one; nothing is ever clipped or hidden
 * behind a scroll edge.
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
  const sessionDetail = mayDraft
    ? "Authenticated via Auth.js. You have permission to edit articles."
    : "Authenticated via Auth.js. You can edit your own contributor record from the Contributors tab.";

  return (
    <div className="w-full">
      <DevSurfaceTitle />

      <div className={RAIL_CLASS}>
        <span
          aria-hidden
          className="theme-accent-emphasis flex h-7 w-7 shrink-0 items-center justify-center"
          title="Dev Tools"
        >
          <Icon icon="lucide:wrench" size={16} className="text-current" />
        </span>

        <nav
          aria-label="Dev mode tools"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"
        >
          {toolGroups.map((group) => (
            <div
              key={group.id}
              role="group"
              aria-label={group.label}
              className="flex min-w-0 flex-wrap items-center gap-0.5"
            >
              <span aria-hidden className={RAIL_GROUP_CAPTION_CLASS}>
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
                      className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1`}
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
                    className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1.5`}
                  >
                    {item.label}
                    {badge}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

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

        <div className="flex shrink-0 items-center gap-1">
          <DevUtilitiesMenu />
          {sessionStatus === "loading" ? (
            <span className="theme-text-muted flex items-center gap-1.5 text-xs">
              <Icon icon="lucide:loader-2" size={14} className="theme-accent-emphasis animate-spin" />
              <span className="sr-only">Loading authentication</span>
            </span>
          ) : isSignedIn ? (
            <>
              <span
                title={sessionDetail}
                className="theme-dev-rail-user flex min-w-0 items-baseline gap-1.5 text-[0.75rem] font-semibold tracking-wide uppercase"
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
                className="theme-dev-rail-button flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-200 motion-reduce:transition-none"
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
          )}
        </div>
      </div>
    </div>
  );
}
