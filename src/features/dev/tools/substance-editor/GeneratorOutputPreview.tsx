import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import { parseGeneratedYaml } from "./yamlParser";
import { EditorCitationDiagnosticsPanel } from "@/features/dev/forms/EditorCitationDiagnosticsPanel";
import { ArticleLayout } from "@/features/article/components/ArticleLayout";

interface GeneratorOutputPreviewProps {
  yamlContent: string;
}

/**
 * Parses the draft YAML and renders it through the public article layout, so
 * the preview is the page the draft will ship as. Only the citation
 * diagnostics sit above it; those are editor tooling, not article content.
 * Route-resolved inputs (banners, copy blocks, avatars, molecule depiction)
 * are left at ArticleLayout's defaults because the draft carries none.
 */
export const GeneratorOutputPreview = memo(function GeneratorOutputPreview({
  yamlContent,
}: GeneratorOutputPreviewProps) {
  const result = parseGeneratedYaml(yamlContent);

  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-[color:var(--theme-danger-border)] bg-[var(--theme-danger-bg)] px-6 py-12">
        <div className="flex items-center gap-2 text-[color:var(--theme-danger-text-strong)]">
          <Icon icon="lucide:alert-triangle" className="h-5 w-5" size={20} />
          <span className="font-medium">Unable to parse YAML</span>
        </div>
        <p className="theme-text-muted max-w-md text-center text-sm">
          {result.error || "The YAML content could not be parsed."}
          {result.lineNumber && (
            <span className="mt-1 block text-[color:var(--theme-danger-text)]">
              Error near line {result.lineNumber}
            </span>
          )}
        </p>
        <p className="theme-text-faint text-sm">
          Switch to the YAML tab to view and fix the raw content.
        </p>
      </div>
    );
  }

  const article = result.data;

  return (
    <div className="space-y-6">
      <EditorCitationDiagnosticsPanel article={article} />
      <ArticleLayout article={article} />
    </div>
  );
});
