import { AboutEditorTab } from "../tools/about/AboutEditorTab";
import { CitationReviewTab } from "../tools/citation-review/CitationReviewTab";
import { IndexLayoutTab } from "../tools/index-layout/IndexLayoutTab";
import { SubstanceEditorTab } from "../tools/substance-editor/SubstanceEditorTab";
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
          <IndexLayoutTab commitPanel={controller.commitPanel} />
        ) : controller.activeTab === "about" ? (
          <AboutEditorTab {...controller.aboutTabProps} />
        ) : controller.activeTab === "citation-review" ? (
          <CitationReviewTab initialSlug={controller.citationReviewInitialSlug} />
        ) : controller.activeTab === "tag-editor" ? (
          <TagEditorTab {...controller.tagEditorTabProps} />
        ) : controller.activeTab === "articles" ? (
          <SubstanceEditorTab
            generatorPrompt={controller.generatorPrompt}
            originalGeneratorPrompt={controller.originalGeneratorPrompt}
            onPromptChange={controller.onGeneratorPromptChange}
            onResetPrompt={controller.onGeneratorPromptReset}
            promptDiff={controller.generatorPromptDiff}
            promptHasChanges={controller.generatorPromptHasChanges}
            onCopyPrompt={controller.onGeneratorPromptCopy}
            renderCommitPanel={controller.renderCommitPanel}
          />
        ) : null}
      </div>
    </main>
  );
}
