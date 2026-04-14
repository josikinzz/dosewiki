import { useQuery as useConvexQuery } from "convex/react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../../../convex/_generated/api";
import {
  appendChangeLogEntry,
  initialChangeLogEntries,
  sortChangeLogEntries,
  type ChangeLogEntry,
} from "@/data/changelog/changeLog";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import {
  buildFallbackProfile,
  deriveProfileKeyFromEmail,
  getProfileByKeyFromList,
} from "@/data/userProfiles";
import { useContributorProfiles } from "@/hooks/useContributorProfiles";
import { canAccessDev } from "@/lib/auth/roles";
import { isConvexEnabled } from "@/lib/convex";
import { AboutEditorTab } from "../tools/about/AboutEditorTab";
import { IndexLayoutTab } from "../tools/index-layout/IndexLayoutTab";
import { SubstanceEditorTab } from "../tools/substance-editor/SubstanceEditorTab";
import { useDevMode } from "../context/DevModeContext";
import { ProfileEditorTab } from "../profile";
import { TagEditorTab } from "../tags";
import { DevModeChangeLogTab } from "./DevModeChangeLogTab";
import { DevModePageChrome, DevModePageLoadingState } from "./DevModePageChrome";
import {
  resolvePrimaryTab,
  type DevModePrimaryTab,
  type DevModeTab,
} from "./devModePageUtils";
import { useDevModeChangeLog } from "./useDevModeChangeLog";
import { useDevModeChangelogState } from "./useDevModeChangelogState";
import { useDevModeSaveActions } from "./useDevModeSaveActions";
import { useDevModeSupportTabProps } from "./useDevModeSupportTabProps";

const devModePrimaryDefaults: Record<DevModePrimaryTab, DevModeTab> = {
  tools: "articles",
  "change-log": "change-log",
  profile: "profile",
};

type DevModePageProps = {
  activeTab: DevModeTab;
  initialArticleSlug?: string;
  initialProfileKey?: string;
  onTabChange: (tab: DevModeTab) => void;
};

export function DevModePage({
  activeTab,
  initialArticleSlug: _initialArticleSlug,
  initialProfileKey,
  onTabChange,
}: DevModePageProps) {
  const {
    articles,
    psychoactiveIndexManual,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    close,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalAboutMarkdown,
    getOriginalAboutSubtitle,
    getOriginalAboutFounderKeys,
    replaceAboutMarkdown,
    resetAboutMarkdown,
    replaceAboutSubtitle,
    resetAboutSubtitle,
    replaceAboutFounderKeys,
    resetAboutFounderKeys,
    generatorPrompt,
    replaceGeneratorPrompt,
    resetGeneratorPrompt,
    getOriginalGeneratorPrompt,
    markChangesSaved,
  } = useDevMode();
  const {
    chemicalClassIndexGroups,
    dosageCategoryGroups,
    effectSummaries,
    mechanismIndexGroups,
    substanceRecords,
  } = useLibrary();

  const [enableStickyPanels, setEnableStickyPanels] = useState(false);
  const [profileData, setProfileData] = useState(() => buildFallbackProfile("Contributor"));
  const [changeLogEntries, setChangeLogEntries] = useState<ChangeLogEntry[]>(() =>
    sortChangeLogEntries(initialChangeLogEntries),
  );

  const convexEnabled = isConvexEnabled();

  const convexChangelogEntries = useConvexQuery(
    api.changelog.getAll,
    convexEnabled ? {} : "skip",
  );

  useEffect(() => {
    if (!convexEnabled || !convexChangelogEntries) {
      return;
    }

    const convexEntries: ChangeLogEntry[] = convexChangelogEntries.map((entry) => ({
      id: entry.entryId,
      createdAt: entry.createdAt,
      commit: {
        sha: "",
        url: "",
        message: entry.message,
      },
      articles: entry.articles,
      markdown: entry.markdown,
      submittedBy: entry.submittedBy,
    }));

    const staticIds = new Set(initialChangeLogEntries.map((entry) => entry.id));
    const mergedEntries = [
      ...convexEntries.filter((entry) => !staticIds.has(entry.id)),
      ...initialChangeLogEntries,
    ];

    setChangeLogEntries(sortChangeLogEntries(mergedEntries));
  }, [convexChangelogEntries, convexEnabled]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(pointer: fine)");
    const update = () => {
      setEnableStickyPanels(query.matches);
    };

    update();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => {
        query.removeEventListener("change", update);
      };
    }

    query.addListener(update);
    return () => {
      query.removeListener(update);
    };
  }, []);

  useEffect(() => {
    const handleKeydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [close]);

  const changeLog = useDevModeChangeLog({
    changeLogEntries,
    enableStickyPanels,
  });
  const { clearNotice: clearChangeLogNotice, pushNotice: pushChangeLogNotice } = changeLog;
  const { profiles: availableProfiles } = useContributorProfiles();
  const changelogState = useDevModeChangelogState({
    articles,
    psychoactiveIndexManual,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    availableProfiles,
    generatorPrompt,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalAboutMarkdown,
    getOriginalAboutSubtitle,
    getOriginalAboutFounderKeys,
    getOriginalGeneratorPrompt,
  });

  const nextSession = useSession();
  const nextSessionRole = nextSession.data?.user?.role;
  const hasAuthenticatedSession = nextSession.status === "authenticated";
  const hasNextEditorSession =
    hasAuthenticatedSession && canAccessDev(nextSessionRole);
  const hasProfileSession = hasAuthenticatedSession;
  const defaultSessionProfileKey = useMemo(() => {
    const email = nextSession.data?.user?.email?.trim() ?? "";
    if (email) {
      return deriveProfileKeyFromEmail(email);
    }

    const name = nextSession.data?.user?.name?.trim() ?? "";
    return name ? name.replace(/[^a-z0-9-]/gi, "").toUpperCase() : "";
  }, [nextSession.data?.user?.email, nextSession.data?.user?.name]);
  const sessionProfileKey = useMemo(
    () => initialProfileKey?.trim().toUpperCase() || defaultSessionProfileKey,
    [defaultSessionProfileKey, initialProfileKey],
  );
  const appendChangeLogEntryToState = useCallback((entry: ChangeLogEntry) => {
    setChangeLogEntries((previous) => appendChangeLogEntry(previous, entry));
  }, []);
  const {
    passwordKey,
    setPasswordKey,
    verifyDevCredentials,
    commitPanel,
    renderCommitPanel,
    clearSaveNotices,
  } = useDevModeSaveActions({
    articles,
    psychoactiveIndexManual,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    generatorPrompt,
    getOriginalArticles,
    markChangesSaved,
    hasAuthenticatedSession,
    hasStoredCredentials: hasNextEditorSession,
    hasNextEditorSession,
    sessionProfileKey,
    convexEnabled,
    datasetChangelog: changelogState.datasetChangelog,
    psychoactiveManualChangelog: changelogState.psychoactiveManualChangelog,
    aboutMarkdownChangelog: changelogState.aboutMarkdownChangelog,
    aboutSubtitleChangelog: changelogState.aboutSubtitleChangelog,
    aboutFounderChangelog: changelogState.aboutFounderChangelog,
    hasAboutMarkdownChanges: changelogState.hasAboutMarkdownChanges,
    hasAboutSubtitleChanges: changelogState.hasAboutSubtitleChanges,
    hasAboutFounderChanges: changelogState.hasAboutFounderChanges,
    hasGeneratorPromptChanges: changelogState.hasGeneratorPromptChanges,
    hasPendingChanges: changelogState.hasPendingChanges,
    onAppendChangeLogEntry: appendChangeLogEntryToState,
    onTabChange,
    pushChangeLogNotice,
  });
  const canonicalProfileKey = passwordKey?.trim().toUpperCase() || sessionProfileKey || "";

  useEffect(() => {
    setProfileData(getProfileByKeyFromList(availableProfiles, canonicalProfileKey));
  }, [availableProfiles, canonicalProfileKey]);

  const profileHistory = useMemo(() => {
    if (!canonicalProfileKey) {
      return [] as ChangeLogEntry[];
    }

    return changeLogEntries
      .filter((entry) => (entry.submittedBy ?? "").toUpperCase() === canonicalProfileKey)
      .slice(0, 6);
  }, [canonicalProfileKey, changeLogEntries]);

  const activePrimaryTab = useMemo(() => resolvePrimaryTab(activeTab), [activeTab]);
  const isIndexLayoutTab = activeTab === "index-layout";
  const mainClassName = isIndexLayoutTab
    ? "w-full px-4 py-12 text-white md:px-6 lg:px-8"
    : "mx-auto w-full max-w-6xl px-4 py-12 text-white md:px-6 lg:px-8";
  const contentWrapperClass = isIndexLayoutTab ? "mt-10 w-full" : "mx-auto w-full max-w-6xl";
  const profileVerifyAttemptRef = useRef(false);

  const clearNoticesForTab = useCallback(
    (tab: DevModeTab) => {
      clearSaveNotices();
      if (tab !== "change-log") {
        clearChangeLogNotice();
      }
    },
    [clearChangeLogNotice, clearSaveNotices],
  );

  const handleTabChange = useCallback(
    (tab: DevModeTab) => {
      clearNoticesForTab(tab);
      if (tab !== activeTab) {
        onTabChange(tab);
      }
    },
    [activeTab, clearNoticesForTab, onTabChange],
  );
  const handlePrimaryTabChange = useCallback(
    (primaryTab: DevModePrimaryTab) => {
      handleTabChange(devModePrimaryDefaults[primaryTab]);
    },
    [handleTabChange],
  );

  useEffect(() => {
    if (activeTab === "profile" && !hasProfileSession) {
      handleTabChange("articles");
    }
  }, [activeTab, handleTabChange, hasProfileSession]);

  useEffect(() => {
    if (activeTab !== "profile" && !hasNextEditorSession) {
      handleTabChange("profile");
    }
  }, [activeTab, handleTabChange, hasNextEditorSession]);

  useEffect(() => {
    if (activeTab !== "profile") {
      profileVerifyAttemptRef.current = false;
      return;
    }

    if (profileVerifyAttemptRef.current || !hasProfileSession || passwordKey) {
      return;
    }

    profileVerifyAttemptRef.current = true;
    verifyDevCredentials().catch(() => {
      // handled through notice state
    });
  }, [activeTab, hasProfileSession, passwordKey, verifyDevCredentials]);

  useEffect(() => {
    clearNoticesForTab(activeTab);
  }, [activeTab, clearNoticesForTab]);

  const handleGeneratorPromptChange = useCallback(
    (value: string) => {
      replaceGeneratorPrompt(value);
    },
    [replaceGeneratorPrompt],
  );
  const handleGeneratorPromptReset = useCallback(() => {
    resetGeneratorPrompt();
  }, [resetGeneratorPrompt]);
  const handleGeneratorPromptCopy = useCallback(() => {
    navigator.clipboard.writeText(generatorPrompt).catch((error) => {
      console.error("Failed to copy generator prompt", error);
    });
  }, [generatorPrompt]);

  const compoundCount = substanceRecords.length;
  const psychoactiveClassCount = dosageCategoryGroups.length;
  const chemicalClassCount = chemicalClassIndexGroups.length;
  const mechanismClassCount = mechanismIndexGroups.length;
  const effectCount = effectSummaries.length;

  const aboutPlaceholderValues = useMemo(() => {
    const formatCount = (value: number) => value.toLocaleString();

    return {
      compoundCount: formatCount(compoundCount),
      psychoactiveClassCount: formatCount(psychoactiveClassCount),
      categoryCount: formatCount(psychoactiveClassCount),
      chemicalClassCount: formatCount(chemicalClassCount),
      mechanismClassCount: formatCount(mechanismClassCount),
      mechanismOfActionClassCount: formatCount(mechanismClassCount),
      effectCount: formatCount(effectCount),
    };
  }, [
    chemicalClassCount,
    compoundCount,
    effectCount,
    mechanismClassCount,
    psychoactiveClassCount,
  ]);

  const { profileTabProps, aboutTabProps, tagEditorTabProps } = useDevModeSupportTabProps({
    profileData,
    profileHistory,
    availableProfiles,
    verifyDevCredentials,
    setProfileData,
    setPasswordKey,
    hasStoredCredentials: hasProfileSession,
    commitPanel,
    combinedChangelogMarkdown: changelogState.combinedChangelogMarkdown,
    hasPendingChanges: changelogState.hasPendingChanges,
    aboutMarkdown,
    originalAboutMarkdown: changelogState.originalAboutMarkdown,
    replaceAboutMarkdown,
    resetAboutMarkdown,
    aboutSubtitle,
    originalAboutSubtitle: changelogState.originalAboutSubtitle,
    replaceAboutSubtitle,
    resetAboutSubtitle,
    aboutFounderKeys,
    originalAboutFounderKeys: changelogState.originalAboutFounderKeys,
    replaceAboutFounderKeys,
    resetAboutFounderKeys,
    markdownDiff: changelogState.aboutMarkdownChangelog.markdown,
    subtitleDiff: changelogState.aboutSubtitleChangelog.markdown,
    subtitleHasChanges: changelogState.aboutSubtitleChangelog.hasChanges,
    placeholderValues: aboutPlaceholderValues,
  });

  const handleSignIn = useCallback(() => {
    const callbackUrl = typeof window !== "undefined" ? window.location.pathname : "/dev";
    window.location.href = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }, []);

  if (articles.length === 0) {
    return <DevModePageLoadingState mainClassName={mainClassName} />;
  }

  return (
    <main id="main-content" tabIndex={-1} className={`${mainClassName} focus:outline-none`}>
      <DevModePageChrome
        activePrimaryTab={activePrimaryTab}
        activeTab={activeTab}
        hasStoredCredentials={hasProfileSession}
        hasNextEditorSession={hasNextEditorSession}
        sessionStatus={nextSession.status}
        userEmail={nextSession.data?.user?.email}
        userImage={nextSession.data?.user?.image}
        userName={nextSession.data?.user?.name}
        onPrimaryTabChange={handlePrimaryTabChange}
        onTabChange={handleTabChange}
        onSignIn={handleSignIn}
      />

      <div className={contentWrapperClass}>
        {activeTab === "change-log" ? (
          <DevModeChangeLogTab controller={changeLog} />
        ) : activeTab === "profile" ? (
          <ProfileEditorTab {...profileTabProps} />
        ) : activeTab === "index-layout" ? (
          <IndexLayoutTab commitPanel={commitPanel} />
        ) : activeTab === "about" ? (
          <AboutEditorTab {...aboutTabProps} />
        ) : activeTab === "tag-editor" ? (
          <TagEditorTab {...tagEditorTabProps} />
        ) : activeTab === "articles" ? (
          <SubstanceEditorTab
            generatorPrompt={generatorPrompt}
            originalGeneratorPrompt={changelogState.originalGeneratorPrompt}
            onPromptChange={handleGeneratorPromptChange}
            onResetPrompt={handleGeneratorPromptReset}
            promptDiff={changelogState.generatorPromptChangelog.markdown}
            promptHasChanges={changelogState.generatorPromptChangelog.hasChanges}
            onCopyPrompt={handleGeneratorPromptCopy}
            renderCommitPanel={renderCommitPanel}
          />
        ) : null}
      </div>
    </main>
  );
}
