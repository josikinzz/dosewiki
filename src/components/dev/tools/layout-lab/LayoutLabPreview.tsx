import { ArticleLayout } from "../../../article/ArticleLayout";
import type { SubstanceRecord } from "../../../../data/builders/contentBuilder";
import type { RouteKey } from "../../../../types/content";

interface LayoutLabPreviewProps {
  record: SubstanceRecord;
  activeRouteKey: RouteKey | null;
  onRouteChange: (route: RouteKey) => void;
  onOpenEditor?: () => void;
}

/**
 * Layout Lab Preview component.
 * Now uses the unified ArticleLayout for consistency with public pages.
 */
export function LayoutLabPreview({
  record,
}: LayoutLabPreviewProps) {
  // Use the original article data with ArticleLayout
  // for consistent rendering with public pages
  return (
    <ArticleLayout
      article={record.article}
    />
  );
}
