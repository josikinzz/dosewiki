import { AboutEditorTab } from "../tools/about/AboutEditorTab";
import { CitationReviewTab } from "../tools/citation-review/CitationReviewTab";
import { IndexLayoutTab } from "../tools/index-layout/IndexLayoutTab";
import { MoleculeEditorTab } from "../tools/molecule-editor/MoleculeEditorTab";
import { ReplicationStudioTab } from "../tools/replication-studio/ReplicationStudioTab";
import { SubstanceEditorTab } from "../tools/substance-editor/SubstanceEditorTab";
import { ArticleFeedbackReviewTab } from "../tools/article-feedback/ArticleFeedbackReviewTab";
import { TripReportSubmissionReviewTab } from "../tools/trip-report-submissions/TripReportSubmissionReviewTab";
import { ProfileEditorTab } from "../profile";
import { TagEditorTab } from "../tags";
import { DevModeChangeLogTab } from "./DevModeChangeLogTab";
import { DevModePageChrome, DevModePageLoadingState } from "./DevModePageChrome";
import type { DevModePageControllerState } from "./devModePageTypes";

type DevModePageViewProps = {
  controller: DevModePageControllerState;
};

export function DevModePageView({ controller }: DevModePageViewProps) {
  if (controller.articlesLength === 0) {
    return <DevModePageLoadingState mainClassName={controller.mainClassName} />;
  }

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
        {controller.activeTab === "change-log" ? (
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
        ) : controller.activeTab === "citation-review" ? (
          <CitationReviewTab initialSlug={controller.citationReviewInitialSlug} />
        ) : controller.activeTab === "trip-report-submissions" ? (
          <TripReportSubmissionReviewTab />
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
