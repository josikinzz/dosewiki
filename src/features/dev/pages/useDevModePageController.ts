import { useCallback, useEffect, useMemo, useRef } from "react";

import { useContributorProfiles } from "@/hooks/useContributorProfiles";
import { useDevMode } from "../context/DevModeContext";
import type { DevProposalSeed } from "../context/devModeTypes";
import {
  tabNeedsChangelogFeed,
  tabNeedsContributorProfiles,
  tabNeedsIndexLayouts,
} from "./devModePageUtils";
import type { DevModeTab } from "./devTabRegistry";
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
  initialFilter,
  initialProfileKey,
  isLibraryLoading = false,
  onTabChange,
}: DevModePageProps): DevModePageControllerState {
  const {
    articles,
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    close,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
    markChangesSaved,
    activeProposal,
    clearActiveProposal,
    discardActiveProposal,
    loadProposal,
    indexLayoutsReadiness,
    requestIndexLayouts,
    retryIndexLayouts,
    requestLibrary,
  } = useDevMode();

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
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
  });

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
  useEffect(() => {
    if (routeAccess.canDraft && tabNeedsIndexLayouts(activeTab)) {
      requestIndexLayouts();
    }
  }, [activeTab, requestIndexLayouts, routeAccess.canDraft]);

  const {
    changeLogEntries,
    appendChangeLogEntryToState,
    feedWindow,
  } = useDevChangelogFeed({ active: tabNeedsChangelogFeed(activeTab) });
  const chromeEnvironment = useDevChromeEnvironment({
    activeTab,
    close,
    hasPendingChanges: changelogState.hasPendingChanges,
    onTabNoticeClear: clearNoticesForTab,
  });
  const changeLog = useDevModeChangeLog({
    changeLogEntries,
    enableStickyPanels: chromeEnvironment.enableStickyPanels,
    feedWindow,
  });
  const { clearNotice: clearChangeLogNotice } = changeLog;

  useEffect(() => {
    clearChangeLogNoticeRef.current = clearChangeLogNotice;
  }, [clearChangeLogNotice]);

  const {
    commitPanel,
    renderCommitPanel,
    clearSaveNotices,
  } = useDevModeSaveActions({
    articles,
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
    markChangesSaved,
    isSignedIn: routeAccess.isSignedIn,
    canDraft: routeAccess.canDraft,
    canApprove: routeAccess.canApprove,
    sessionProfileKey: routeAccess.sessionProfileKey,
    datasetChangelog: changelogState.datasetChangelog,
    psychoactiveManualChangelog: changelogState.psychoactiveManualChangelog,
    chemicalManualChangelog: changelogState.chemicalManualChangelog,
    mechanismManualChangelog: changelogState.mechanismManualChangelog,
    hasPendingChanges: changelogState.hasPendingChanges,
    onAppendChangeLogEntry: appendChangeLogEntryToState,
    activeProposal,
    onClearActiveProposal: clearActiveProposal,
    onDiscardActiveProposal: discardActiveProposal,
  });

  useEffect(() => {
    clearSaveNoticesRef.current = clearSaveNotices;
  }, [clearSaveNotices]);

  const { tagEditorTabProps } = useDevSupportTabsController({
    commitPanel,
    combinedChangelogMarkdown: changelogState.combinedChangelogMarkdown,
    hasPendingChanges: changelogState.hasPendingChanges,
  });

  const contributorDirectory = useMemo(
    () => ({ profiles: availableProfiles, isLoading: profilesLoading }),
    [availableProfiles, profilesLoading],
  );

  const handleSignIn = useCallback(() => {
    const callbackUrl = typeof window !== "undefined" ? window.location.pathname : "/dev";
    window.location.href = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }, []);

  const { onTabChange: changeTab } = routeAccess;
  // The seed lands in the working set before the editor opens on it, so the
  // substances tab never renders a half-applied rebase.
  const handleLoadProposal = useCallback(
    async (seed: DevProposalSeed) => {
      requestIndexLayouts();
      await requestLibrary();
      await loadProposal(seed);
      changeTab("articles");
    },
    [changeTab, loadProposal, requestIndexLayouts, requestLibrary],
  );
  return {
    activePrimaryTab: routeAccess.activePrimaryTab,
    mainClassName: chromeEnvironment.mainClassName,
    contentWrapperClass: chromeEnvironment.contentWrapperClass,
    enableStickyPanels: chromeEnvironment.enableStickyPanels,
    isSignedIn: routeAccess.isSignedIn,
    role: routeAccess.role,
    canDraft: routeAccess.canDraft,
    canApprove: routeAccess.canApprove,
    activeTabLockReason: routeAccess.activeTabLockReason,
    sessionProfileKey: routeAccess.sessionProfileKey,
    sessionStatus: routeAccess.sessionStatus,
    userEmail: routeAccess.userEmail,
    userImage: routeAccess.userImage,
    userName: routeAccess.userName,
    articlesLength: articles.length,
    // Treat "still draining" and "drained to nothing" alike: both mean the
    // corpus-backed tools have nothing real to show yet.
    indexLayoutsReadiness,
    retryIndexLayouts,
    isLibraryLoading: isLibraryLoading || articles.length === 0,
    activeTab,
    changeLog,
    commitPanel,
    renderCommitPanel,
    articlesInitialSlug: initialArticleSlug,
    citationReviewInitialSlug: initialArticleSlug,
    moleculeEditorInitialSlug: initialArticleSlug,
    replicationsInitialSlug: initialArticleSlug,
    bannersInitialSlug: initialArticleSlug,
    writingInitialSlug: initialArticleSlug,
    copyStudioInitialKey: initialArticleSlug,
    playlistsInitialKey: initialArticleSlug,
    initialFilter,
    tagEditorTabProps,
    contributorDirectory,
    onPrimaryTabChange: routeAccess.onPrimaryTabChange,
    onTabChange: routeAccess.onTabChange,
    onLoadProposal: handleLoadProposal,
    onSignIn: handleSignIn,
    onLeave: chromeEnvironment.leaveEditor,
  };
}
