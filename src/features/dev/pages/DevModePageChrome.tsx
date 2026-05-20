import { signOut } from "next-auth/react";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DevModePrimaryTab, DevModeTab } from "./devModePageUtils";

const tabTriggerClass =
  "gap-2.5 rounded-xl px-5 py-2.5 text-[0.9375rem] font-medium text-white/60 transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5";

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
      <h1 className="font-display mt-4 flex items-center justify-center gap-3 text-[2.25rem] font-bold tracking-tight text-fuchsia-300 sm:text-[2.7rem]">
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
          <p className="text-sm text-white/60">Loading articles...</p>
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
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20">
          {sessionStatus === "loading" ? (
            <div className="flex items-center justify-center gap-3 py-4">
              <Icon icon="lucide:loader-2" size={20} className="animate-spin text-fuchsia-400" />
              <span className="text-white/70">Loading authentication...</span>
            </div>
          ) : hasNextEditorSession ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-200">
                  {userImage ? (
                    <AppImage
                      src={userImage}
                      alt=""
                      width={20}
                      height={20}
                      className="h-5 w-5 rounded-full"
                    />
                  ) : null}
                  <Icon icon="lucide:badge-check" size={16} />
                  <span>Signed in as {userLabel}</span>
                </div>
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
              <p className="text-xs text-white/45">
                Authenticated via Auth.js. You have permission to edit articles.
              </p>
            </div>
          ) : hasStoredCredentials ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 font-semibold text-cyan-200">
                  {userImage ? (
                    <AppImage
                      src={userImage}
                      alt=""
                      width={20}
                      height={20}
                      className="h-5 w-5 rounded-full"
                    />
                  ) : null}
                  <Icon icon="lucide:user-round" size={16} />
                  <span>Signed in as {userLabel}</span>
                </div>
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
              <p className="text-xs text-white/45">
                Authenticated via Auth.js. You can edit your own contributor profile from this tab.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              <p className="text-center text-sm text-white/70">
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
        </div>
      </div>

      <div className="mt-8 flex w-full flex-col items-center gap-4">
        <Tabs
          value={activePrimaryTab}
          onValueChange={(value) => onPrimaryTabChange(value as DevModePrimaryTab)}
          className="flex justify-center"
        >
          <TabsList className="h-auto flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/5 p-1.5">
            <TabsTrigger value="tools" disabled={!hasNextEditorSession} className={tabTriggerClass}>
              <Icon icon="lucide:wrench" size={18} />
              Tools
            </TabsTrigger>
            <TabsTrigger value="change-log" disabled={!hasNextEditorSession} className={tabTriggerClass}>
              <Icon icon="lucide:scroll-text" size={18} />
              Change log
            </TabsTrigger>
            <TabsTrigger
              value="profile"
              disabled={!hasStoredCredentials}
              className={`${tabTriggerClass} disabled:opacity-30`}
            >
              <Icon icon="lucide:user-round" size={18} />
              Profile
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {activePrimaryTab === "tools" ? (
          <Tabs
            value={activeTab}
            onValueChange={(value) => onTabChange(value as DevModeTab)}
            className="flex justify-center"
          >
            <TabsList className="h-auto flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/5 p-1.5">
              <TabsTrigger value="articles" className={tabTriggerClass}>
                <Icon icon="lucide:sparkles" size={18} />
                Substance Articles
              </TabsTrigger>
              <TabsTrigger value="citation-review" className={tabTriggerClass}>
                <Icon icon="lucide:list-checks" size={18} />
                Citation Review
              </TabsTrigger>
              <TabsTrigger value="tag-editor" className={tabTriggerClass}>
                <Icon icon="lucide:tags" size={18} />
                Tags
              </TabsTrigger>
              <TabsTrigger value="about" className={tabTriggerClass}>
                <Icon icon="lucide:file-text" size={18} />
                About
              </TabsTrigger>
              <TabsTrigger value="index-layout" className={tabTriggerClass}>
                <Icon icon="lucide:layout-dashboard" size={18} />
                Index layout
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>
    </div>
  );
}
