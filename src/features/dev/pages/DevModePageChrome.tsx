import { signOut } from "next-auth/react";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  EditorNavTabs,
  EditorPanel,
  EditorPanelBody,
  EditorStatusPill,
} from "@/features/dev/components";
import type { DevModePrimaryTab, DevModeTab } from "./devModePageUtils";

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
        <div className="mt-20 flex flex-col items-center justify-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
          <p className="text-sm theme-text-muted">Loading articles...</p>
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

  return (
    <div className="mx-auto w-full max-w-6xl">
      <DevModePageHeading />

      <div className="mt-8 flex justify-center">
        <EditorPanel variant="inset" className="w-full max-w-xl">
          <EditorPanelBody>
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
                Sign in to access developer tools and edit articles.
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
          </EditorPanelBody>
        </EditorPanel>
      </div>

      <div className="mt-8 flex w-full flex-col items-center gap-4">
        <EditorNavTabs
          label="Dev mode primary sections"
          value={activePrimaryTab}
          onChange={(value) => onPrimaryTabChange(value as DevModePrimaryTab)}
          options={[
            { value: "tools", label: "Tools", icon: "lucide:wrench", disabled: !hasNextEditorSession },
            { value: "change-log", label: "Change log", icon: "lucide:scroll-text", disabled: !hasNextEditorSession },
            { value: "profile", label: "Profile", icon: "lucide:user-round", disabled: !hasStoredCredentials },
          ]}
          className="justify-center rounded-2xl"
        />

        {activePrimaryTab === "tools" ? (
          <EditorNavTabs
            label="Dev mode tools"
            value={activeTab}
            onChange={(value) => onTabChange(value as DevModeTab)}
            options={[
              { value: "articles", label: "Substance Articles", icon: "lucide:sparkles" },
              { value: "citation-review", label: "Citation Review", icon: "lucide:list-checks" },
              { value: "tag-editor", label: "Tags", icon: "lucide:tags" },
              { value: "about", label: "About", icon: "lucide:file-text" },
              { value: "index-layout", label: "Index layout", icon: "lucide:layout-dashboard" },
            ]}
            className="justify-center rounded-2xl"
          />
        ) : null}
      </div>
    </div>
  );
}
