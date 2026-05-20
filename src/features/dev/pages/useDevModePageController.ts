import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLibrary } from "@/data/SubstanceIndexProvider";
import { buildFallbackProfile, getProfileByKeyFromList } from "@/data/userProfiles";
import { useContributorProfiles } from "@/hooks/useContributorProfiles";
import { useDevMode } from "../context/DevModeContext";
import type { DevModeTab } from "./devModePageUtils";
import type { DevModePageControllerState, DevModePageProps } from "./devModePageTypes";
import { useDevChangelogFeed } from "./useDevChangelogFeed";
import { useDevChromeEnvironment } from "./useDevChromeEnvironment";
import { useDevModeChangeLog } from "./useDevModeChangeLog";
import { useDevModeChangelogState } from "./useDevModeChangelogState";
import { useDevModeSaveActions } from "./useDevModeSaveActions";
import { useDevSupportTabsController } from "./useDevModeSupportTabProps";
import { useDevRouteAccess } from "./useDevRouteAccess";

export function useDevModePageController({
  activeTab,
  initialArticleSlug,
  initialProfileKey,
  onTabChange,
}: DevModePageProps): DevModePageControllerState {
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

  const [profileData, setProfileData] = useState(() => buildFallbackProfile("Contributor"));
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

  const profileVerifyAttemptRef = useRef(false);
  const clearSaveNoticesRef = useRef<(() => void) | null>(null);
  const clearChangeLogNoticeRef = useRef<(() => void) | null>(null);

  const clearNoticesForTab = useCallback(
    (tab: DevModeTab) => {
      clearSaveNoticesRef.current?.();
      if (tab !== "change-log") {
        clearChangeLogNoticeRef.current?.();
      }
    },
    [],
  );

  const routeAccess = useDevRouteAccess({
    activeTab,
    initialProfileKey,
    onTabChange,
    onClearNoticesForTab: clearNoticesForTab,
  });

  const {
    changeLogEntries,
    getProfileHistory,
    convexEnabled,
    appendChangeLogEntryToState,
  } = useDevChangelogFeed({ profileKey: routeAccess.sessionProfileKey });
  const chromeEnvironment = useDevChromeEnvironment({
    activeTab,
    close,
    onTabNoticeClear: clearNoticesForTab,
  });
  const changeLog = useDevModeChangeLog({
    changeLogEntries,
    enableStickyPanels: chromeEnvironment.enableStickyPanels,
  });
  const { clearNotice: clearChangeLogNotice, pushNotice: pushChangeLogNotice } = changeLog;

  useEffect(() => {
    clearChangeLogNoticeRef.current = clearChangeLogNotice;
  }, [clearChangeLogNotice]);

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
    hasAuthenticatedSession: routeAccess.hasAuthenticatedSession,
    hasStoredCredentials: routeAccess.hasNextEditorSession,
    hasNextEditorSession: routeAccess.hasNextEditorSession,
    sessionProfileKey: routeAccess.sessionProfileKey,
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
    onTabChange: routeAccess.onTabChange,
    pushChangeLogNotice,
  });

  useEffect(() => {
    clearSaveNoticesRef.current = clearSaveNotices;
  }, [clearSaveNotices]);

  const effectiveProfileKey =
    passwordKey?.trim().toUpperCase() || routeAccess.sessionProfileKey || "";
  const profileHistory = useMemo(
    () => getProfileHistory(effectiveProfileKey),
    [effectiveProfileKey, getProfileHistory],
  );

  useEffect(() => {
    setProfileData(getProfileByKeyFromList(availableProfiles, effectiveProfileKey));
  }, [availableProfiles, effectiveProfileKey]);

  useEffect(() => {
    if (activeTab !== "profile") {
      profileVerifyAttemptRef.current = false;
      return;
    }

    if (
      profileVerifyAttemptRef.current ||
      !routeAccess.hasProfileSession ||
      passwordKey
    ) {
      return;
    }

    profileVerifyAttemptRef.current = true;
    verifyDevCredentials().catch(() => {
      // handled through notice state
    });
  }, [
    activeTab,
    passwordKey,
    routeAccess.hasProfileSession,
    verifyDevCredentials,
  ]);

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

  const aboutPlaceholderValues = useMemo(() => {
    const formatCount = (value: number) => value.toLocaleString();

    return {
      compoundCount: formatCount(substanceRecords.length),
      psychoactiveClassCount: formatCount(dosageCategoryGroups.length),
      categoryCount: formatCount(dosageCategoryGroups.length),
      chemicalClassCount: formatCount(chemicalClassIndexGroups.length),
      mechanismClassCount: formatCount(mechanismIndexGroups.length),
      mechanismOfActionClassCount: formatCount(mechanismIndexGroups.length),
      effectCount: formatCount(effectSummaries.length),
    };
  }, [
    chemicalClassIndexGroups.length,
    dosageCategoryGroups.length,
    effectSummaries.length,
    mechanismIndexGroups.length,
    substanceRecords.length,
  ]);

  const { profileTabProps, aboutTabProps, tagEditorTabProps } = useDevSupportTabsController({
    profileData,
    profileHistory,
    availableProfiles,
    verifyDevCredentials,
    setProfileData,
    setPasswordKey,
    hasStoredCredentials: routeAccess.hasProfileSession,
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

  return {
    activePrimaryTab: routeAccess.activePrimaryTab,
    mainClassName: chromeEnvironment.mainClassName,
    contentWrapperClass: chromeEnvironment.contentWrapperClass,
    hasProfileSession: routeAccess.hasProfileSession,
    hasNextEditorSession: routeAccess.hasNextEditorSession,
    sessionStatus: routeAccess.sessionStatus,
    userEmail: routeAccess.userEmail,
    userImage: routeAccess.userImage,
    userName: routeAccess.userName,
    articlesLength: articles.length,
    activeTab,
    changeLog,
    commitPanel,
    renderCommitPanel,
    generatorPrompt,
    originalGeneratorPrompt: changelogState.originalGeneratorPrompt,
    generatorPromptDiff: changelogState.generatorPromptChangelog.markdown,
    generatorPromptHasChanges: changelogState.generatorPromptChangelog.hasChanges,
    citationReviewInitialSlug: initialArticleSlug,
    profileTabProps,
    aboutTabProps,
    tagEditorTabProps,
    profileHistory,
    onPrimaryTabChange: routeAccess.onPrimaryTabChange,
    onTabChange: routeAccess.onTabChange,
    onSignIn: handleSignIn,
    onGeneratorPromptChange: handleGeneratorPromptChange,
    onGeneratorPromptReset: handleGeneratorPromptReset,
    onGeneratorPromptCopy: handleGeneratorPromptCopy,
  };
}
