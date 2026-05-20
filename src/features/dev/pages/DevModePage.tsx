import { DevModePageView } from "./DevModePageView";
import type { DevModePageProps } from "./devModePageTypes";
import { useDevModePageController } from "./useDevModePageController";

export function DevModePage({
  activeTab,
  initialArticleSlug,
  initialProfileKey,
  onTabChange,
}: DevModePageProps) {
  const controller = useDevModePageController({
    activeTab,
    initialArticleSlug,
    initialProfileKey,
    onTabChange,
  });
  return <DevModePageView controller={controller} />;
}
