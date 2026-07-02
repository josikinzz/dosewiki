import type { ReactNode } from "react";

import { signOut } from "next-auth/react";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import {
  PublicSegmentedTabs,
  type PublicSegmentedTabItem,
} from "@/components/layout/PublicSegmentedTabs";
import { Button } from "@/components/ui/button";
import { EditorStatusPill } from "@/features/dev/components";
import type { DevModePrimaryTab, DevModeTab } from "./devModePageUtils";

const PRIMARY_TAB_ITEMS: PublicSegmentedTabItem<DevModePrimaryTab>[] = [
  { id: "tools", label: "Tools", icon: "lucide:wrench", prominence: "major" },
  { id: "change-log", label: "Change log", icon: "lucide:scroll-text", prominence: "major" },
  { id: "profile", label: "Profile", icon: "lucide:user-round", prominence: "major" },
];

const TOOL_TAB_ITEMS: PublicSegmentedTabItem<DevModeTab>[] = [
  { id: "articles", label: "Substance Articles", icon: "lucide:sparkles" },
  { id: "citation-review", label: "Citation Review", icon: "lucide:list-checks" },
  { id: "trip-report-submissions", label: "Trip Reports", icon: "lucide:file-signature" },
  { id: "tag-editor", label: "Tags", icon: "lucide:tags" },
  { id: "molecule-editor", label: "Molecules", icon: "lucide:hexagon" },
  { id: "about", label: "About", icon: "lucide:file-text" },
  { id: "index-layout", label: "Index layout", icon: "lucide:layout-dashboard" },
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

/**
 * Compact left-aligned workbench header: small title on the left, auth
 * controls trailing on the right (wrapping below on narrow viewports).
 */
function DevModePageHeading({ children }: { children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <h1 className="font-display theme-accent-emphasis flex items-center gap-2.5 text-xl font-bold tracking-tight sm:text-2xl">
        <Icon icon="lucide:wrench" size={22} className="text-current" />
        <span>Dev Tools</span>
      </h1>
      {children ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">{children}</div>
      ) : null}
    </header>
  );
}

function SignedInControls({
  tone,
  detail,
  userImage,
  userLabel,
}: {
  tone: "success" | "info";
  detail: string;
  userImage?: string | null;
  userLabel: string;
}) {
  return (
    <>
      <EditorStatusPill
        tone={tone}
        icon={tone === "success" ? "lucide:badge-check" : "lucide:user-round"}
        title={detail}
      >
        {userImage ? (
          <AppImage
            src={userImage}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 rounded-full"
          />
        ) : null}
        <span>Signed in as {userLabel}</span>
      </EditorStatusPill>
      <Button
        variant="outline"
        size="xs"
        className="rounded-full"
        onClick={() => void signOut({ callbackUrl: "/sign-in" })}
      >
        <Icon icon="lucide:log-out" size={16} />
        Sign out
      </Button>
    </>
  );
}

export function DevModePageLoadingState({ mainClassName }: { mainClassName: string }) {
  return (
    <main id="main-content" tabIndex={-1} className={`${mainClassName} focus:outline-none`}>
      <div className="mx-auto w-full max-w-6xl">
        <DevModePageHeading />
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

export function DevModePageChrome({
  activePrimaryTab,
  activeTab,
  hasStoredCredentials,
  hasNextEditorSession,
  sessionStatus,
  userEmail,
  userImage,
  userName,
  onPrimaryTabChange,
  onTabChange,
  onSignIn,
}: DevModePageChromeProps) {
  const userLabel = userName ?? userEmail ?? "Editor";

  const primaryTabItems = PRIMARY_TAB_ITEMS.map((item) =>
    item.id === "profile" ? { ...item, disabled: !hasStoredCredentials } : item,
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <DevModePageHeading>
        {sessionStatus === "loading" ? (
          <span className="theme-text-muted flex items-center gap-2 text-xs">
            <Icon icon="lucide:loader-2" size={16} className="theme-accent-emphasis animate-spin" />
            Loading authentication...
          </span>
        ) : hasNextEditorSession ? (
          <SignedInControls
            tone="success"
            detail="Authenticated via Auth.js. You have permission to edit articles."
            userImage={userImage}
            userLabel={userLabel}
          />
        ) : hasStoredCredentials ? (
          <SignedInControls
            tone="info"
            detail="Authenticated via Auth.js. You can edit your own contributor profile from the Profile tab."
            userImage={userImage}
            userLabel={userLabel}
          />
        ) : (
          <>
            <span className="theme-text-muted text-xs">
              Sign in before saving changes or using protected actions.
            </span>
            <Button variant="default" size="xs" className="rounded-full px-4" onClick={onSignIn}>
              <Icon icon="lucide:log-in" size={16} />
              Sign in
            </Button>
          </>
        )}
      </DevModePageHeading>

      <div className="mt-5 flex w-full flex-col items-start gap-3">
        <PublicSegmentedTabs
          ariaLabel="Dev mode primary sections"
          value={activePrimaryTab}
          onValueChange={onPrimaryTabChange}
          items={primaryTabItems}
          className="justify-start"
          listClassName="justify-start"
        />

        {activePrimaryTab === "tools" ? (
          <PublicSegmentedTabs
            ariaLabel="Dev mode tools"
            value={activeTab}
            onValueChange={onTabChange}
            items={TOOL_TAB_ITEMS}
            className="justify-start"
            listClassName="justify-start"
          />
        ) : null}
      </div>
    </div>
  );
}
