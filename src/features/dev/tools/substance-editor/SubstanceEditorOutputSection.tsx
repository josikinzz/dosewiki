import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { JsonEditor } from "@/features/dev/components/JsonEditor";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneratorOutputPreview } from "./GeneratorOutputPreview";
import { parseGeneratedYaml } from "./yamlParser";
import { SubstanceEditorProvider, type SubstanceEditorContextValue } from "./SubstanceEditorContext";
import { ArticleDraftFormFieldsRHF } from "../../forms/ArticleDraftFormFieldsRHF";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import type { SubstanceArticle } from "@/schema";
import type { OutputViewMode } from "./types";

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
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-fuchsia-200">Substance Article</h2>
          {formDirty && outputViewMode === "form" && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={outputViewMode} onValueChange={(value) => onOutputViewModeChange(value as OutputViewMode)}>
            <TabsList>
              <TabsTrigger value="yaml">YAML</TabsTrigger>
              <TabsTrigger value="form">
                <Icon icon="lucide:file-edit" className="mr-1.5 h-3.5 w-3.5" size={14} />
                Form
              </TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
          </Tabs>
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
        <div className="mb-4 flex items-center gap-2 text-sm text-red-400">
          <Icon icon="lucide:alert-triangle" className="h-4 w-4" size={16} />
          {saveError}
        </div>
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
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
                <div className="mb-4 flex items-center gap-2 text-red-400">
                  <Icon icon="lucide:alert-circle" className="h-5 w-5" size={20} />
                  <span className="font-medium">Failed to parse YAML</span>
                </div>
                <p className="mb-4 text-sm text-white/70">{formParseError}</p>
                <Button variant="glass" size="pill" onClick={() => onOutputViewModeChange("yaml")}>
                  Switch to YAML
                </Button>
              </div>
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
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
                <div className="mb-4 flex items-center gap-2 text-red-400">
                  <Icon icon="lucide:alert-circle" className="h-5 w-5" size={20} />
                  <span className="font-medium">Failed to parse YAML</span>
                </div>
                <p className="mb-4 text-sm text-white/70">{parseResult.error ?? "Unknown error"}</p>
                <Button variant="glass" size="pill" onClick={() => onOutputViewModeChange("yaml")}>
                  Switch to YAML
                </Button>
              </div>
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
