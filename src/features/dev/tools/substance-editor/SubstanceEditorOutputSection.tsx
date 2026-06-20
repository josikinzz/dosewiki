import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { JsonEditor } from "@/features/dev/components/JsonEditor";
import { EditorNotice, EditorStatusPill } from "@/features/dev/components";
import { Button } from "@/components/ui/button";
import {
  PublicSegmentedTabs,
  type PublicSegmentedTabItem,
} from "@/components/layout/PublicSegmentedTabs";
import { GeneratorOutputPreview } from "./GeneratorOutputPreview";
import { parseGeneratedYaml } from "./yamlParser";
import { SubstanceEditorProvider, type SubstanceEditorContextValue } from "./SubstanceEditorContext";
import { ArticleDraftFormFieldsRHF } from "../../forms/ArticleDraftFormFieldsRHF";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import type { SubstanceArticle } from "@/schema";
import type { OutputViewMode } from "./types";

const OUTPUT_VIEW_TABS: PublicSegmentedTabItem<OutputViewMode>[] = [
  { id: "yaml", label: "YAML" },
  { id: "form", icon: "lucide:file-edit", label: "Form" },
  { id: "preview", label: "Preview" },
];

type SubstanceEditorOutputSectionProps = {
  streamedOutput: string;
  outputViewMode: OutputViewMode;
  formDirty: boolean;
  formParseError: string | null;
  formArticleOverride: SubstanceArticle | null;
  selectedSubstanceSlug: string | null;
  onOutputViewModeChange: (mode: OutputViewMode) => void;
  onCopy: () => void;
  onDownload: () => void;
  onOutputChange: (value: string) => void;
  onFormMutate: () => void;
  saveError: string | null;
  formRef: React.RefObject<UseArticleFormReturn | null>;
  substanceEditorContextValue: SubstanceEditorContextValue;
};

export function SubstanceEditorOutputSection({
  streamedOutput,
  outputViewMode,
  formDirty,
  formParseError,
  formArticleOverride,
  selectedSubstanceSlug,
  onOutputViewModeChange,
  onCopy,
  onDownload,
  onOutputChange,
  onFormMutate,
  saveError,
  formRef,
  substanceEditorContextValue,
}: SubstanceEditorOutputSectionProps) {
  if (!streamedOutput) {
    return null;
  }

  return (
    <SectionCard delay={0.25}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="theme-accent-heading text-lg font-semibold">Substance Article</h2>
          {formDirty && outputViewMode === "form" && (
            <EditorStatusPill tone="warning" icon="lucide:circle-dot" live>
              Unsaved changes
            </EditorStatusPill>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PublicSegmentedTabs
            ariaLabel="Output view"
            value={outputViewMode}
            onValueChange={onOutputViewModeChange}
            items={OUTPUT_VIEW_TABS}
          />
          <div className="flex gap-2">
            <Button variant="glass" size="pill" onClick={onCopy}>
              <Icon icon="lucide:copy" className="h-3.5 w-3.5" size={14} />
              Copy
            </Button>
            <Button variant="glass" size="pill" onClick={onDownload}>
              <Icon icon="lucide:download" className="h-3.5 w-3.5" size={14} />
              Download
            </Button>
          </div>
        </div>
      </div>
      {saveError && (
        <EditorNotice
          className="mb-4"
          notice={{ tone: "danger", message: saveError, live: true }}
        />
      )}
      {outputViewMode === "yaml" && (
        <JsonEditor
          id="generated-output"
          value={streamedOutput}
          onChange={onOutputChange}
          minHeight={400}
        />
      )}
      {outputViewMode === "form" && (
        (() => {
          if (formParseError) {
            return (
              <EditorNotice
                notice={{
                  tone: "danger",
                  title: "Failed to parse YAML",
                  message: formParseError,
                  live: true,
                  actions: (
                    <Button variant="glass" size="pill" onClick={() => onOutputViewModeChange("yaml")}>
                      Switch to YAML
                    </Button>
                  ),
                }}
              />
            );
          }

          const hydratedArticle =
            formArticleOverride ??
            (() => {
              const parseResult = parseGeneratedYaml(streamedOutput);
              return parseResult.success ? parseResult.data ?? null : null;
            })();

          if (!hydratedArticle) {
            const parseResult = parseGeneratedYaml(streamedOutput);
            return (
              <EditorNotice
                notice={{
                  tone: "danger",
                  title: "Failed to parse YAML",
                  message: parseResult.error ?? "Unknown error",
                  live: true,
                  actions: (
                    <Button variant="glass" size="pill" onClick={() => onOutputViewModeChange("yaml")}>
                      Switch to YAML
                    </Button>
                  ),
                }}
              />
            );
          }

          return (
            <SubstanceEditorProvider value={substanceEditorContextValue}>
              <ArticleDraftFormFieldsRHF
                key={selectedSubstanceSlug}
                idPrefix="generator-form"
                article={hydratedArticle}
                onMutate={onFormMutate}
                formRef={formRef}
              />
            </SubstanceEditorProvider>
          );
        })()
      )}
      {outputViewMode === "preview" && <GeneratorOutputPreview yamlContent={streamedOutput} />}
    </SectionCard>
  );
}
