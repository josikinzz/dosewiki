import { UnsavedWorkProvider } from "../components/unsavedWork";
import { DevModePageView } from "./DevModePageView";
import type { DevModePageProps } from "./devModePageTypes";
import { useDevModePageController } from "./useDevModePageController";

function DevModePageContent({
  activeTab,
  initialArticleSlug,
  initialFilter,
  initialProfileKey,
  isLibraryLoading,
  onTabChange,
}: DevModePageProps) {
  const controller = useDevModePageController({
    activeTab,
    initialArticleSlug,
    initialFilter,
    initialProfileKey,
    isLibraryLoading,
    onTabChange,
  });
  return <DevModePageView controller={controller} />;
}

/**
 * The registry sits above the controller so the shell's own shared draft and
 * every tool below report into the one dialog the chrome consults.
 */
export function DevModePage(props: DevModePageProps) {
  return (
    <UnsavedWorkProvider>
      <DevModePageContent {...props} />
    </UnsavedWorkProvider>
  );
}
