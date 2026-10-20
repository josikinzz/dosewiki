"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  DevModePageChrome,
  DevToolLoadingPanel,
} from "./DevModePageChrome";
import type { DevModePageControllerState } from "./devModePageTypes";
import { LIBRARY_DEPENDENT_TABS } from "./devModePageUtils";
import { findDevTab, isShellDevTab, type DevShellTab } from "./devTabRegistry";
import { LoadErrorState } from "../components";
import { DevWriteStatus } from "./DevToolSaveLine";
import { StagedArticlesRecoveryNotice } from "./StagedArticlesRecoveryNotice";

const loading = () => <DevToolLoadingPanel />;
const DevModeChangeLogTab = dynamic(
  () => import("./DevModeChangeLogTab").then((m) => m.DevModeChangeLogTab),
  { ssr: false, loading },
);

const WritingTab = dynamic(
  () => import("../tools/writing/WritingTab").then((m) => m.WritingTab),
  { ssr: false, loading },
);
const CopyStudioTab = dynamic(
  () => import("../tools/copy-studio/CopyStudioTab").then((m) => m.CopyStudioTab),
  { ssr: false, loading },
);
const QueueTab = dynamic(
  () => import("../tools/queue/QueueTab").then((m) => m.QueueTab),
  { ssr: false, loading },
);
const HomeTab = dynamic(
  () => import("../tools/home/HomeTab").then((m) => m.HomeTab),
  { ssr: false, loading },
);
const InboxTab = dynamic(
  () => import("../tools/inbox/InboxTab").then((m) => m.InboxTab),
  { ssr: false, loading },
);
const ContributorsTab = dynamic(
  () => import("../tools/contributors/ContributorsTab").then((m) => m.ContributorsTab),
  { ssr: false, loading },
);
const PlaylistsTab = dynamic(
  () => import("../tools/playlists/PlaylistsTab").then((m) => m.PlaylistsTab),
  { ssr: false, loading },
);
const CitationReviewTab = dynamic(
  () => import("../tools/citation-review/CitationReviewTab").then((m) => m.CitationReviewTab),
  { ssr: false, loading },
);
const IndexLayoutTab = dynamic(
  () => import("../tools/index-layout/IndexLayoutTab").then((m) => m.IndexLayoutTab),
  { ssr: false, loading },
);
const MoleculeEditorTab = dynamic(
  () => import("../tools/molecule-editor/MoleculeEditorTab").then((m) => m.MoleculeEditorTab),
  { ssr: false, loading },
);
const ReplicationStudioTab = dynamic(
  () => import("../tools/replication-studio/ReplicationStudioTab").then((m) => m.ReplicationStudioTab),
  { ssr: false, loading },
);
const WarningBannersTab = dynamic(
  () => import("../tools/warning-banners/WarningBannersTab").then((m) => m.WarningBannersTab),
  { ssr: false, loading },
);
const SubstanceEditorTab = dynamic(
  () => import("../tools/substance-editor/SubstanceEditorTab").then((m) => m.SubstanceEditorTab),
  { ssr: false, loading },
);
const FeedbackTab = dynamic(
  () => import("../tools/feedback/FeedbackTab").then((m) => m.FeedbackTab),
  { ssr: false, loading },
);
const TripReportPortalTab = dynamic(
  () =>
    import("../tools/trip-report-portal/TripReportPortalTab").then((m) => m.TripReportPortalTab),
  { ssr: false, loading },
);
const TagEditorTab = dynamic(
  () => import("../tags").then((m) => m.TagEditorTab),
  { ssr: false, loading },
);
const PeopleTab = dynamic(
  () => import("../tools/people/PeopleTab").then((m) => m.PeopleTab),
  { ssr: false, loading },
);
const GlossaryTab = dynamic(
  () => import("../tools/glossary/GlossaryTab").then((m) => m.GlossaryTab),
  { ssr: false, loading },
);
const MyReportsTab = dynamic(
  () => import("../tools/my-reports/MyReportsTab").then((m) => m.MyReportsTab),
  { ssr: false, loading },
);

type ToolRenderer = (controller: DevModePageControllerState) => ReactNode;

const TOOL_RENDERERS: Record<DevShellTab, ToolRenderer> = {
  "change-log": (controller) => (
    <DevModeChangeLogTab
      controller={controller.changeLog}
      contributorProfiles={controller.contributorDirectory.profiles}
    />
  ),
  "index-layout": (controller) => (
    <IndexLayoutTab
      {...controller.indexLayoutTabProps}
      commitPanel={controller.commitPanel}
    />
  ),
  "writing": (controller) => (
    <WritingTab
      contributorProfiles={controller.contributorDirectory.profiles}
      profilesLoading={controller.contributorDirectory.isLoading}
      initialSlug={controller.writingInitialSlug}
      initialKind={controller.initialFilter}
      canApprove={controller.canApprove}
    />
  ),
  "copy-studio": (controller) => (
    <CopyStudioTab initialKey={controller.copyStudioInitialKey} canApprove={controller.canApprove} />
  ),
  "queue": (controller) => (
    <QueueTab
      viewerRole={controller.role}
      canApprove={controller.canApprove}
      onLoadIntoEditor={controller.onLoadProposal}
      initialProposalId={controller.queueInitialId}
      actorEmail={controller.userEmail ?? null}
    />
  ),
  "home": (controller) => (
    <HomeTab role={controller.role} profileKey={controller.sessionProfileKey} />
  ),
  "inbox": (controller) => (
    <InboxTab actorEmail={controller.userEmail ?? null} />
  ),
  "contributors": (controller) => (
    <ContributorsTab
      profiles={controller.contributorDirectory.profiles}
      isDirectoryLoading={controller.contributorDirectory.isLoading}
      canEdit={controller.canDraft}
      canApprove={controller.canApprove}
      sessionProfileKey={controller.sessionProfileKey}
      viewerEmail={controller.userEmail}
      initialScope={controller.initialFilter}
      initialKey={controller.contributorsInitialKey}
    />
  ),
  "playlists": (controller) => (
    <PlaylistsTab isAdmin={controller.canApprove} initialKey={controller.playlistsInitialKey} />
  ),
  "citation-review": (controller) => (
    <CitationReviewTab
      initialSlug={controller.citationReviewInitialSlug}
      actorEmail={controller.userEmail ?? null}
    />
  ),
  "trip-report-submissions": (controller) => (
    <TripReportPortalTab
      initialSubmissionId={controller.tripReportsInitialId}
      actorEmail={controller.userEmail ?? null}
    />
  ),
  "article-feedback": (controller) => (
    <FeedbackTab
      initialSource={controller.initialFilter}
      initialId={controller.feedbackInitialId}
      actorEmail={controller.userEmail ?? null}
    />
  ),
  "tag-editor": (controller) => (
    <TagEditorTab {...controller.tagEditorTabProps} />
  ),
  "molecule-editor": (controller) => (
    <MoleculeEditorTab initialSlug={controller.moleculeEditorInitialSlug} />
  ),
  "replications": (controller) => (
    <ReplicationStudioTab initialSubstanceSlug={controller.replicationsInitialSlug} />
  ),
  "banners": (controller) => (
    <WarningBannersTab initialSubstanceSlug={controller.bannersInitialSlug} />
  ),
  "people": (controller) => (
    <PeopleTab
      profiles={controller.contributorDirectory.profiles}
      isDirectoryLoading={controller.contributorDirectory.isLoading}
      sessionProfileKey={controller.sessionProfileKey}
      initialPerson={controller.peopleInitialKey}
    />
  ),
  "glossary": (controller) => (
    <GlossaryTab viewerRole={controller.role} />
  ),
  "my-reports": (controller) => (
    <MyReportsTab canApprove={controller.canApprove} />
  ),
  "articles": (controller) => (
    <SubstanceEditorTab initialSlug={controller.articlesInitialSlug} />
  ),
};

type DevModePageViewProps = {
  controller: DevModePageControllerState;
};

function DevToolLockedPanel({ label, reason, onGoHome }: { label: string; reason: string; onGoHome?: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <StateCard
        icon="lucide:lock"
        tone="warning"
        align="center"
        title={reason}
        description={`${label} is closed to your role. Ask an admin if you need it.`}
        actions={onGoHome ? <Button type="button" variant="outline" size="sm" onClick={onGoHome}>Go to Home</Button> : undefined}
      />
    </div>
  );
}
function IndexLayoutReadinessPanel({
  readiness,
  onRetry,
}: {
  readiness: DevModePageControllerState["indexLayoutsReadiness"];
  onRetry: () => void;
}) {
  if (readiness.status === "error") {
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <LoadErrorState
          what="the index layouts"
          message={`${readiness.error ?? "The server did not send them."} Nothing can be arranged until they load.`}
          onRetry={onRetry}
        />
      </div>
    );
  }
  return <DevToolLoadingPanel label="Loading the index layouts" />;
}

export function DevModePageView({ controller }: DevModePageViewProps) {
  const activeDescriptor = findDevTab(controller.activeTab);
  const isWaitingOnLibrary =
    controller.isLibraryLoading && LIBRARY_DEPENDENT_TABS.has(controller.activeTab);
  const isWaitingOnLayouts =
    controller.activeTab === "index-layout" && controller.indexLayoutsReadiness.status !== "ready";
  const toolReady = controller.activeTabLockReason === null && !isWaitingOnLibrary && !isWaitingOnLayouts;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`${controller.mainClassName} focus:outline-none`}
    >
      <DevModePageChrome
        activePrimaryTab={controller.activePrimaryTab}
        activeTab={controller.activeTab}
        isSignedIn={controller.isSignedIn}
        role={controller.role}
        sessionStatus={controller.sessionStatus}
        userEmail={controller.userEmail}
        userImage={controller.userImage}
        userName={controller.userName}
        glossaryLocales={controller.glossaryLocales}
        onPrimaryTabChange={controller.onPrimaryTabChange}
        onTabChange={controller.onTabChange}
        onOpenPath={controller.onOpenPath}
        onSignIn={controller.onSignIn}
        onLeave={controller.onLeave}
      />

      <DevWriteStatus tab={activeDescriptor} canApprove={controller.canApprove} ready={toolReady} />

      <div key={controller.toolMountKey} className={controller.contentWrapperClass}>
        {controller.canDraft ? (
          <StagedArticlesRecoveryNotice
            recovery={controller.stagedRecovery}
            showSaveTime={controller.activeTab === "tag-editor"}
          />
        ) : null}
        {controller.activeTabLockReason !== null ? (
          <DevToolLockedPanel
            label={activeDescriptor.label}
            reason={controller.activeTabLockReason}
            onGoHome={controller.activeTab === "home" ? undefined : () => controller.onTabChange("home")}
          />
        ) : controller.activeTab === "index-layout"
          && controller.indexLayoutsReadiness.status !== "ready" ? (
          <IndexLayoutReadinessPanel
            readiness={controller.indexLayoutsReadiness}
            onRetry={controller.retryIndexLayouts}
          />
        ) : isWaitingOnLibrary && controller.libraryError ? (
          <LoadErrorState what="the articles" message={controller.libraryError} onRetry={controller.retryLibrary} />
        ) : isWaitingOnLibrary ? (
          <DevToolLoadingPanel label="Loading articles" />
        ) : isShellDevTab(controller.activeTab) ? (
          TOOL_RENDERERS[controller.activeTab](controller)
        ) : null}
      </div>
    </main>
  );
}
