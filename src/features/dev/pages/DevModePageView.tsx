"use client";

import dynamic from "next/dynamic";

import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  DevModePageChrome,
  DevToolLoadingPanel,
} from "./DevModePageChrome";
import type { DevModePageControllerState } from "./devModePageTypes";
import { LIBRARY_DEPENDENT_TABS } from "./devModePageUtils";
import { findDevTab } from "./devTabRegistry";
import { LoadErrorState } from "../components";
import { DevWriteStatus } from "./DevToolSaveLine";
import { StagedArticlesRecoveryNotice } from "./StagedArticlesRecoveryNotice";

/**
 * Every tool is its own lazily-loaded chunk. The shell used to pull every tool
 * bundle into the first paint even though exactly one of them is ever on
 * screen; splitting them keeps the tab rail cheap and lets a tool's code arrive
 * alongside its data instead of ahead of every other tool's.
 *
 * `ssr: false` throughout: these surfaces are editor-only, already behind the
 * client-side Postgres provider, and never render on the server.
 */
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

type DevModePageViewProps = {
  controller: DevModePageControllerState;
};

/**
 * Stands in for a tool the settled session may not use. The tab stays
 * addressable so a deep link explains itself instead of bouncing; the tool's
 * chunk is never loaded and none of its reads start.
 */
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
  // The write status describes a save the editor can make now: never over a
  // locked tool or a loading panel.
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

      {/* Keyed so a Cmd+K record remounts the open tool on the record it names. */}
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
        ) : controller.activeTab === "change-log" ? (
          <DevModeChangeLogTab
            controller={controller.changeLog}
            contributorProfiles={controller.contributorDirectory.profiles}
          />
        ) : controller.activeTab === "index-layout" ? (
          <IndexLayoutTab
            {...controller.indexLayoutTabProps}
            commitPanel={controller.commitPanel}
          />
        ) : controller.activeTab === "writing" ? (
          <WritingTab
            contributorProfiles={controller.contributorDirectory.profiles}
            profilesLoading={controller.contributorDirectory.isLoading}
            initialSlug={controller.writingInitialSlug}
            initialKind={controller.initialFilter}
            canApprove={controller.canApprove}
          />
        ) : controller.activeTab === "copy-studio" ? (
          <CopyStudioTab initialKey={controller.copyStudioInitialKey} canApprove={controller.canApprove} />
        ) : controller.activeTab === "queue" ? (
          <QueueTab
            viewerRole={controller.role}
            canApprove={controller.canApprove}
            onLoadIntoEditor={controller.onLoadProposal}
            initialProposalId={controller.queueInitialId}
            actorEmail={controller.userEmail ?? null}
          />
        ) : controller.activeTab === "home" ? (
          <HomeTab role={controller.role} profileKey={controller.sessionProfileKey} />
        ) : controller.activeTab === "inbox" ? (
          <InboxTab actorEmail={controller.userEmail ?? null} />
        ) : controller.activeTab === "contributors" ? (
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
        ) : controller.activeTab === "playlists" ? (
          <PlaylistsTab isAdmin={controller.canApprove} initialKey={controller.playlistsInitialKey} />
        ) : controller.activeTab === "citation-review" ? (
          <CitationReviewTab
            initialSlug={controller.citationReviewInitialSlug}
            actorEmail={controller.userEmail ?? null}
          />
        ) : controller.activeTab === "trip-report-submissions" ? (
          <TripReportPortalTab
            initialSubmissionId={controller.tripReportsInitialId}
            actorEmail={controller.userEmail ?? null}
          />
        ) : controller.activeTab === "article-feedback" ? (
          <FeedbackTab
            initialSource={controller.initialFilter}
            initialId={controller.feedbackInitialId}
            actorEmail={controller.userEmail ?? null}
          />
        ) : controller.activeTab === "tag-editor" ? (
          <TagEditorTab {...controller.tagEditorTabProps} />
        ) : controller.activeTab === "molecule-editor" ? (
          <MoleculeEditorTab initialSlug={controller.moleculeEditorInitialSlug} />
        ) : controller.activeTab === "replications" ? (
          <ReplicationStudioTab initialSubstanceSlug={controller.replicationsInitialSlug} />
        ) : controller.activeTab === "banners" ? (
          <WarningBannersTab initialSubstanceSlug={controller.bannersInitialSlug} />
        ) : controller.activeTab === "people" ? (
          <PeopleTab
            profiles={controller.contributorDirectory.profiles}
            isDirectoryLoading={controller.contributorDirectory.isLoading}
            sessionProfileKey={controller.sessionProfileKey}
            initialPerson={controller.peopleInitialKey}
          />
        ) : controller.activeTab === "glossary" ? (
          <GlossaryTab viewerRole={controller.role} />
        ) : controller.activeTab === "my-reports" ? (
          <MyReportsTab canApprove={controller.canApprove} />
        ) : controller.activeTab === "articles" ? (
          <SubstanceEditorTab initialSlug={controller.articlesInitialSlug} />
        ) : null}
      </div>
    </main>
  );
}
