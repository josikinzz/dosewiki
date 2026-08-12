"use client";

import dynamic from "next/dynamic";

import { DevModeChangeLogTab } from "./DevModeChangeLogTab";
import {
  DevModePageChrome,
  DevToolLoadingPanel,
} from "./DevModePageChrome";
import type { DevModePageControllerState } from "./devModePageTypes";
import { LIBRARY_DEPENDENT_TABS } from "./devModePageUtils";

/**
 * Every tool is its own lazily-loaded chunk. The shell used to pull all ten
 * bundles into the first paint even though exactly one of them is ever on
 * screen; splitting them keeps the tab rail cheap and lets a tool's code arrive
 * alongside its data instead of ahead of every other tool's.
 *
 * `ssr: false` throughout: these surfaces are editor-only, already behind the
 * client-side Convex provider, and never render on the server.
 */
const loading = () => <DevToolLoadingPanel />;

const AboutEditorTab = dynamic(
  () => import("../tools/about/AboutEditorTab").then((m) => m.AboutEditorTab),
  { ssr: false, loading },
);
const CopyStudioTab = dynamic(
  () => import("../tools/copy-studio/CopyStudioTab").then((m) => m.CopyStudioTab),
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
const SubstanceEditorTab = dynamic(
  () => import("../tools/substance-editor/SubstanceEditorTab").then((m) => m.SubstanceEditorTab),
  { ssr: false, loading },
);
const ArticleFeedbackReviewTab = dynamic(
  () => import("../tools/article-feedback/ArticleFeedbackReviewTab").then((m) => m.ArticleFeedbackReviewTab),
  { ssr: false, loading },
);
const TripReportPortalTab = dynamic(
  () =>
    import("../tools/trip-report-portal/TripReportPortalTab").then((m) => m.TripReportPortalTab),
  { ssr: false, loading },
);
const ProfileEditorTab = dynamic(
  () => import("../profile").then((m) => m.ProfileEditorTab),
  { ssr: false, loading },
);
const TagEditorTab = dynamic(
  () => import("../tags").then((m) => m.TagEditorTab),
  { ssr: false, loading },
);

type DevModePageViewProps = {
  controller: DevModePageControllerState;
};

export function DevModePageView({ controller }: DevModePageViewProps) {
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
        hasStoredCredentials={controller.hasProfileSession}
        hasNextEditorSession={controller.hasNextEditorSession}
        sessionStatus={controller.sessionStatus}
        userEmail={controller.userEmail}
        userImage={controller.userImage}
        userName={controller.userName}
        onPrimaryTabChange={controller.onPrimaryTabChange}
        onTabChange={controller.onTabChange}
        onSignIn={controller.onSignIn}
      />

      <div className={controller.contentWrapperClass}>
        {isWaitingOnLibrary ? (
          <DevToolLoadingPanel label="Loading articles" />
        ) : controller.activeTab === "change-log" ? (
          <DevModeChangeLogTab controller={controller.changeLog} />
        ) : controller.activeTab === "profile" ? (
          <ProfileEditorTab {...controller.profileTabProps} />
        ) : controller.activeTab === "index-layout" ? (
          <IndexLayoutTab
            commitPanel={controller.renderCommitPanel(
              undefined,
              "Save index layout changes to Convex. Requires login to save.",
            )}
          />
        ) : controller.activeTab === "about" ? (
          <AboutEditorTab {...controller.aboutTabProps} />
        ) : controller.activeTab === "copy-studio" ? (
          <CopyStudioTab />
        ) : controller.activeTab === "citation-review" ? (
          <CitationReviewTab initialSlug={controller.citationReviewInitialSlug} />
        ) : controller.activeTab === "trip-report-submissions" ? (
          <TripReportPortalTab />
        ) : controller.activeTab === "article-feedback" ? (
          <ArticleFeedbackReviewTab />
        ) : controller.activeTab === "tag-editor" ? (
          <TagEditorTab {...controller.tagEditorTabProps} />
        ) : controller.activeTab === "molecule-editor" ? (
          <MoleculeEditorTab initialSlug={controller.moleculeEditorInitialSlug} />
        ) : controller.activeTab === "replications" ? (
          <ReplicationStudioTab />
        ) : controller.activeTab === "articles" ? (
          <SubstanceEditorTab
            renderCommitPanel={controller.renderCommitPanel}
          />
        ) : null}
      </div>
    </main>
  );
}
