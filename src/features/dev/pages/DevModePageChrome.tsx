"use client";

import { signOut } from "next-auth/react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import type { DevModePrimaryTab, DevModeTab } from "./devModePageUtils";

type ToolTabItem = { id: DevModeTab; label: string };

/**
 * Text-only tool tabs. Icons were removed deliberately: at eleven destinations
 * in one rail an icon per tab is noise, not wayfinding — the labels already
 * name the tools, and the violet selected treatment carries the "you are here".
 */
const TOOL_TAB_ITEMS: ToolTabItem[] = [
  { id: "articles", label: "Articles" },
  { id: "review", label: "Review" },
  { id: "citation-review", label: "Citations" },
  { id: "trip-report-submissions", label: "Trip reports" },
  { id: "article-feedback", label: "Feedback" },
  { id: "tag-editor", label: "Tags" },
  { id: "molecule-editor", label: "Molecules" },
  { id: "replications", label: "Replications" },
  { id: "about", label: "About" },
  { id: "index-layout", label: "Index layout" },
];

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type DevModePageChromeProps = {
  activePrimaryTab: DevModePrimaryTab;
  activeTab: DevModeTab;
  hasStoredCredentials: boolean;
  hasNextEditorSession: boolean;
  sessionStatus: SessionStatus;
  userEmail?: string | null;
  userImage?: string | null;
  userName?: string | null;
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onTabChange: (tab: DevModeTab) => void;
  onSignIn: () => void;
};

const RAIL_CLASS =
  "theme-dev-rail flex h-10 w-full items-center gap-1 rounded-lg border px-1.5";

const RAIL_TAB_CLASS =
  "theme-dev-rail-tab shrink-0 snap-start whitespace-nowrap rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45 data-[state=active]:font-semibold";

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

export function DevModePageLoadingState({ mainClassName }: { mainClassName: string }) {
  return (
    <main id="main-content" tabIndex={-1} className={`${mainClassName} focus:outline-none`}>
      <div className="w-full">
        <DevSurfaceTitle />
        <div className="mx-auto mt-10 max-w-xl">
          <StateCard
            icon="lucide:wrench"
            tone="accent"
            loading
            align="center"
            title="Loading articles"
            description="Pulling the latest substance dataset into the editor. This only takes a moment."
          />
        </div>
      </div>
    </main>
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
 * One slim toolbar row, desktop-app style: a wrench mark, the tool tabs, then a
 * trailing cluster with the secondary destinations (Change log, Profile) and
 * the session controls. The tab strip scrolls horizontally rather than wrapping
 * so the rail is always exactly one row tall.
 */
export function DevModePageChrome({
  activePrimaryTab,
  activeTab,
  hasStoredCredentials,
  hasNextEditorSession,
  sessionStatus,
  userEmail,
  userName,
  onPrimaryTabChange,
  onTabChange,
  onSignIn,
}: DevModePageChromeProps) {
  const userLabel = userName ?? userEmail ?? "Editor";
  const isToolsSection = activePrimaryTab === "tools";
  const sessionDetail = hasNextEditorSession
    ? "Authenticated via Auth.js. You have permission to edit articles."
    : "Authenticated via Auth.js. You can edit your own contributor profile from the Profile tab.";

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
          className="flex min-w-0 flex-1 snap-x snap-mandatory items-center gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TOOL_TAB_ITEMS.map((item) => {
            const isActive = isToolsSection && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                data-state={isActive ? "active" : "inactive"}
                onClick={() => onTabChange(item.id)}
                className={RAIL_TAB_CLASS}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <RailDivider />

        <nav aria-label="Dev mode sections" className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-current={activePrimaryTab === "change-log" ? "page" : undefined}
            data-state={activePrimaryTab === "change-log" ? "active" : "inactive"}
            onClick={() => onPrimaryTabChange("change-log")}
            className={RAIL_TAB_CLASS}
          >
            Change log
          </button>
          <button
            type="button"
            disabled={!hasStoredCredentials}
            aria-current={activePrimaryTab === "profile" ? "page" : undefined}
            data-state={activePrimaryTab === "profile" ? "active" : "inactive"}
            onClick={() => onPrimaryTabChange("profile")}
            className={RAIL_TAB_CLASS}
          >
            Profile
          </button>
        </nav>

        <RailDivider />

        <div className="flex shrink-0 items-center gap-1">
          {sessionStatus === "loading" ? (
            <span className="theme-text-muted flex items-center gap-1.5 text-xs">
              <Icon icon="lucide:loader-2" size={14} className="theme-accent-emphasis animate-spin" />
              <span className="sr-only">Loading authentication</span>
            </span>
          ) : hasNextEditorSession || hasStoredCredentials ? (
            <>
              <span
                title={sessionDetail}
                className="theme-dev-rail-user max-w-[10rem] truncate text-[0.75rem] font-semibold tracking-wide uppercase"
              >
                <span className="sr-only">Signed in as </span>
                {userLabel}
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
