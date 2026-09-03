import { DevModePageView } from "./DevModePageView";
import type { DevModePageProps } from "./devModePageTypes";
import { useDevModePageController } from "./useDevModePageController";

export function DevModePage({
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
