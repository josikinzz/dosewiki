"use client";

import dynamic from "next/dynamic";

import { StateCard } from "@/components/common/StateCard";
import { EditorStatusPill, type EditorStatusPillTone } from "@/features/dev/components";
import { Button } from "@/components/ui/button";
import {
  DevModePageChrome,
  DevToolLoadingPanel,
} from "./DevModePageChrome";
import type { DevModePageControllerState } from "./devModePageTypes";
import { LIBRARY_DEPENDENT_TABS } from "./devModePageUtils";
import { findDevTab, type DevTabDescriptor } from "./devTabRegistry";

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
const MembersTab = dynamic(
  () => import("../tools/members/MembersTab").then((m) => m.MembersTab),
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
 * The save model, said once per tool. Staged tools hold edits in a draft
 * until the editor commits; immediate tools write on Save. The commit card
 * at the foot of a staged tool repeats the verb, never the explanation.
 */
const SAVE_FAMILY_PILL: Record<
  DevTabDescriptor["saveFamily"],
  { label: string; detail: string; icon: string; tone: EditorStatusPillTone }
> = {
  staged: {
    label: "Apply to draft, then commit to production",
    detail: "Edits stay in your draft until you press Commit to production.",
    icon: "lucide:file-pen-line",
    tone: "info",
  },
  immediate: {
    label: "Save writes to production",
    detail: "Each Save goes to the live site right away.",
    icon: "lucide:zap",
    tone: "success",
  },
};

/**
 * One line above every tool naming its save family, read off the registry
 * descriptor so a tool cannot say one thing and do another. Only tools the
 * shell renders get one: the chrome cluster (Change log) is not a tool, and
 * an external destination (Review) never renders here at all.
 */
function DevToolSaveFamily({ tab, canApprove }: { tab: DevTabDescriptor; canApprove: boolean }) {
  if (tab.group === "chrome" || tab.destination.kind !== "shell" || tab.id === "queue") {
    return null;
  }
  const needsReview = !canApprove && (tab.saveFamily === "staged" || tab.id === "writing" || tab.id === "copy-studio");
  const pill = needsReview
    ? { label: "Changes need admin approval", detail: "Submitting for review does not publish your changes.", icon: "lucide:git-pull-request", tone: "info" as const }
    : SAVE_FAMILY_PILL[tab.saveFamily];
  return (
    <div className="mt-4 flex justify-end">
      <EditorStatusPill tone={pill.tone} icon={pill.icon} title={pill.detail}>
        {pill.label}
      </EditorStatusPill>
    </div>
  );
}

/**
 * Stands in for a tool the settled session may not use. The tab stays
 * addressable so a deep link explains itself instead of bouncing; the tool's
 * chunk is never loaded and none of its reads start.
 */
function DevToolLockedPanel({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <StateCard
        icon="lucide:lock"
        tone="warning"
        align="center"
        title={reason}
        description={`${label} is closed to your role. Ask an admin if you need it.`}
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
      <StateCard
        compact
        tone="danger"
        title="Unable to load editor layouts"
        description={readiness.error}
        actions={<Button variant="secondary" onClick={onRetry}>Retry loading editor layouts</Button>}
      />
    );
  }
  return <DevToolLoadingPanel label="Loading editor layouts" />;
}

export function DevModePageView({ controller }: DevModePageViewProps) {
  const activeDescriptor = findDevTab(controller.activeTab);
  const isWaitingOnLibrary =
    controller.isLibraryLoading && LIBRARY_DEPENDENT_TABS.has(controller.activeTab);

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
        onPrimaryTabChange={controller.onPrimaryTabChange}
        onTabChange={controller.onTabChange}
        onSignIn={controller.onSignIn}
        onLeave={controller.onLeave}
      />

      <div className={controller.contentWrapperClass}>
        <DevToolSaveFamily tab={activeDescriptor} canApprove={controller.canApprove} />
        {controller.activeTabLockReason !== null ? (
          <DevToolLockedPanel label={activeDescriptor.label} reason={controller.activeTabLockReason} />
        ) : controller.activeTab === "index-layout"
          && controller.indexLayoutsReadiness.status !== "ready" ? (
          <IndexLayoutReadinessPanel
            readiness={controller.indexLayoutsReadiness}
            onRetry={controller.retryIndexLayouts}
          />
        ) : isWaitingOnLibrary ? (
          <DevToolLoadingPanel label="Loading articles" />
        ) : controller.activeTab === "change-log" ? (
          <DevModeChangeLogTab controller={controller.changeLog} />
        ) : controller.activeTab === "index-layout" ? (
          <IndexLayoutTab
            enableStickyPanels={controller.enableStickyPanels}
            commitPanel={controller.renderCommitPanel(
              undefined,
              "Index layout edits stay in your draft until you commit them. Committed changes appear on the live site right away.",
            )}
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
            canApprove={controller.canApprove}
            onLoadIntoEditor={controller.onLoadProposal}
          />
        ) : controller.activeTab === "contributors" ? (
          <ContributorsTab
            profiles={controller.contributorDirectory.profiles}
            isDirectoryLoading={controller.contributorDirectory.isLoading}
            canEdit={controller.canDraft}
            canApprove={controller.canApprove}
            sessionProfileKey={controller.sessionProfileKey}
            initialScope={controller.initialFilter}
          />
        ) : controller.activeTab === "playlists" ? (
          <PlaylistsTab isAdmin={controller.canApprove} initialKey={controller.playlistsInitialKey} />
        ) : controller.activeTab === "citation-review" ? (
          <CitationReviewTab initialSlug={controller.citationReviewInitialSlug} />
        ) : controller.activeTab === "trip-report-submissions" ? (
          <TripReportPortalTab />
        ) : controller.activeTab === "article-feedback" ? (
          <FeedbackTab initialSource={controller.initialFilter} />
        ) : controller.activeTab === "tag-editor" ? (
          <TagEditorTab {...controller.tagEditorTabProps} />
        ) : controller.activeTab === "molecule-editor" ? (
          <MoleculeEditorTab initialSlug={controller.moleculeEditorInitialSlug} />
        ) : controller.activeTab === "replications" ? (
          <ReplicationStudioTab initialSubstanceSlug={controller.replicationsInitialSlug} />
        ) : controller.activeTab === "banners" ? (
          <WarningBannersTab initialSubstanceSlug={controller.bannersInitialSlug} />
        ) : controller.activeTab === "members" ? (
          <MembersTab />
        ) : controller.activeTab === "glossary" ? (
          <GlossaryTab viewerRole={controller.role} />
        ) : controller.activeTab === "my-reports" ? (
          <MyReportsTab canApprove={controller.canApprove} />
        ) : controller.activeTab === "articles" ? (
          <SubstanceEditorTab
            initialSlug={controller.articlesInitialSlug}
            renderCommitPanel={controller.renderCommitPanel}
          />
        ) : null}
      </div>
    </main>
  );
}
