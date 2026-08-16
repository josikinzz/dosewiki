import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLibrary } from "@/data/SubstanceIndexProvider";
import { buildFallbackProfile, getProfileByKeyFromList } from "@/data/userProfiles";
import { useContributorProfiles } from "@/hooks/useContributorProfiles";
import { useDevMode } from "../context/DevModeContext";
import {
  tabNeedsChangelogFeed,
  tabNeedsContributorProfiles,
  type DevModeTab,
} from "./devModePageUtils";
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
  isLibraryLoading = false,
  onTabChange,
}: DevModePageProps): DevModePageControllerState {
  const {
    articles,
    articleHydration,
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    close,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
    getOriginalAboutMarkdown,
    getOriginalAboutSubtitle,
    getOriginalAboutFounderKeys,
    replaceAboutMarkdown,
    resetAboutMarkdown,
    replaceAboutSubtitle,
    resetAboutSubtitle,
    replaceAboutFounderKeys,
    resetAboutFounderKeys,
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
  // The contributor directory and the changelog feed are per-tab, not per-shell:
  // the trip-report, article-feedback, molecule and replication tools read
  // neither, and used to pay for both on every load.
  const { profiles: availableProfiles, isLoading: profilesLoading } = useContributorProfiles(
    tabNeedsContributorProfiles(activeTab),
  );
  const changelogState = useDevModeChangelogState({
    articles,
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    availableProfiles,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
    getOriginalAboutMarkdown,
    getOriginalAboutSubtitle,
    getOriginalAboutFounderKeys,
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
  } = useDevChangelogFeed({
    profileKey: routeAccess.sessionProfileKey,
    active: tabNeedsChangelogFeed(activeTab),
  });
  const chromeEnvironment = useDevChromeEnvironment({
    activeTab,
    close,
    hasPendingChanges: changelogState.hasPendingChanges,
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
    chemicalIndexManual,
    mechanismIndexManual,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    getOriginalArticles,
    articlesAreComplete: articleHydration.isFullCorpusHydrated,
    markChangesSaved,
    hasAuthenticatedSession: routeAccess.hasAuthenticatedSession,
    hasStoredCredentials: routeAccess.hasNextEditorSession,
    hasNextEditorSession: routeAccess.hasNextEditorSession,
    sessionProfileKey: routeAccess.sessionProfileKey,
    convexEnabled,
    datasetChangelog: changelogState.datasetChangelog,
    psychoactiveManualChangelog: changelogState.psychoactiveManualChangelog,
    chemicalManualChangelog: changelogState.chemicalManualChangelog,
    mechanismManualChangelog: changelogState.mechanismManualChangelog,
    aboutMarkdownChangelog: changelogState.aboutMarkdownChangelog,
    aboutSubtitleChangelog: changelogState.aboutSubtitleChangelog,
    aboutFounderChangelog: changelogState.aboutFounderChangelog,
    hasAboutMarkdownChanges: changelogState.hasAboutMarkdownChanges,
    hasAboutSubtitleChanges: changelogState.hasAboutSubtitleChanges,
    hasAboutFounderChanges: changelogState.hasAboutFounderChanges,
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
      // The dev shell loads no published-report or replication corpus (the
      // Trip Report Portal and gallery fetch their own, tab-locally), so
      // these preview counts stay at zero.
      reportCount: formatCount(0),
      replicationCount: formatCount(0),
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
    profilesLoading,
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

  const contributorDirectory = useMemo(
    () => ({ profiles: availableProfiles, isLoading: profilesLoading }),
    [availableProfiles, profilesLoading],
  );

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
    // Treat "still draining" and "drained to nothing" alike: both mean the
    // corpus-backed tools have nothing real to show yet.
    isLibraryLoading: isLibraryLoading || articles.length === 0,
    activeTab,
    changeLog,
    commitPanel,
    renderCommitPanel,
    citationReviewInitialSlug: initialArticleSlug,
    moleculeEditorInitialSlug: initialArticleSlug,
    replicationsInitialSlug: initialArticleSlug,
    bannersInitialSlug: initialArticleSlug,
    writingInitialSlug: initialArticleSlug,
    profileTabProps,
    aboutTabProps,
    tagEditorTabProps,
    profileHistory,
    contributorDirectory,
    onPrimaryTabChange: routeAccess.onPrimaryTabChange,
    onTabChange: routeAccess.onTabChange,
    onSignIn: handleSignIn,
  };
}
