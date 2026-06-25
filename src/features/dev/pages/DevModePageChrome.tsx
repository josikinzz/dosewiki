import { signOut } from "next-auth/react";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import {
  PublicSegmentedTabs,
  type PublicSegmentedTabItem,
} from "@/components/layout/PublicSegmentedTabs";
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/ui/surface";
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

function DevModePageHeading() {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h1 className="font-display mt-4 flex items-center justify-center gap-3 text-[2.25rem] font-bold tracking-tight theme-accent-emphasis sm:text-[2.7rem]">
        <Icon icon="lucide:wrench" size={32} className="text-current" />
        <span>Dev Tools</span>
      </h1>
    </div>
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
      <DevModePageHeading />

      <div className="mt-7 flex justify-center">
        <ContentCard padding="md" className="w-full max-w-xl">
          {sessionStatus === "loading" ? (
            <div className="flex items-center justify-center gap-3 py-4">
              <Icon icon="lucide:loader-2" size={20} className="animate-spin theme-accent-emphasis" />
              <span className="theme-text-muted">Loading authentication...</span>
            </div>
          ) : hasNextEditorSession ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
                <EditorStatusPill tone="success" icon="lucide:badge-check">
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
                  className="self-start rounded-full"
                  onClick={() => void signOut({ callbackUrl: "/sign-in" })}
                >
                  <Icon icon="lucide:log-out" size={16} />
                  Sign out
                </Button>
              </div>
              <p className="text-xs theme-text-faint">
                Authenticated via Auth.js. You have permission to edit articles.
              </p>
            </div>
          ) : hasStoredCredentials ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
                <EditorStatusPill tone="info" icon="lucide:user-round">
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
                  className="self-start rounded-full"
                  onClick={() => void signOut({ callbackUrl: "/sign-in" })}
                >
                  <Icon icon="lucide:log-out" size={16} />
                  Sign out
                </Button>
              </div>
              <p className="text-xs theme-text-faint">
                Authenticated via Auth.js. You can edit your own contributor profile from this tab.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              <p className="text-center text-sm theme-text-muted">
                Developer tools are visible. Sign in before saving changes or using protected actions.
              </p>
              <Button
                variant="default"
                size="pill"
                className="rounded-full px-6"
                onClick={onSignIn}
              >
                <Icon icon="lucide:log-in" size={16} />
                Sign in
              </Button>
            </div>
          )}
        </ContentCard>
      </div>

      <div className="mt-7 flex w-full flex-col items-center gap-3">
        <PublicSegmentedTabs
          ariaLabel="Dev mode primary sections"
          value={activePrimaryTab}
          onValueChange={onPrimaryTabChange}
          items={primaryTabItems}
        />

        {activePrimaryTab === "tools" ? (
          <PublicSegmentedTabs
            ariaLabel="Dev mode tools"
            value={activeTab}
            onValueChange={onTabChange}
            items={TOOL_TAB_ITEMS}
          />
        ) : null}
      </div>
    </div>
  );
}
