import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { parseGeneratedYaml } from "../../../../utils/yamlParser";
import type { GeneratedArticle } from "../../../../types/generatorSchema";
import {
  PreviewHeroSection,
  PreviewDosageDurationCard,
  PreviewPharmacologySection,
  PreviewSubjectiveEffectsSection,
  PreviewInteractionsSection,
  PreviewToleranceSection,
  PreviewHarmPotentialSection,
  PreviewReagentSection,
  PreviewLegalitySection,
  PreviewCitationsSection,
} from "./preview";

interface GeneratorOutputPreviewProps {
  yamlContent: string;
}

/**
 * Main preview orchestrator component.
 * Parses YAML content and renders a visual article preview.
 */
export const GeneratorOutputPreview = memo(function GeneratorOutputPreview({
  yamlContent,
}: GeneratorOutputPreviewProps) {
  const result = parseGeneratedYaml(yamlContent);

  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-6 py-12">
        <div className="flex items-center gap-2 text-rose-300">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Unable to parse YAML</span>
        </div>
        <p className="max-w-md text-center text-sm text-white/60">
          {result.error || "The YAML content could not be parsed."}
          {result.lineNumber && (
            <span className="block mt-1 text-rose-300">
              Error near line {result.lineNumber}
            </span>
          )}
        </p>
        <p className="text-sm text-white/40">
          Switch to the YAML tab to view and fix the raw content.
        </p>
      </div>
    );
  }

  const article = result.data;

  return (
    <div className="space-y-6">
      <PreviewHeroSection article={article} />
      <PreviewDosageDurationCard article={article} />
      <PreviewPharmacologySection article={article} />
      <PreviewSubjectiveEffectsSection article={article} />
      <PreviewInteractionsSection article={article} />
      <PreviewToleranceSection article={article} />
      <PreviewHarmPotentialSection article={article} />
      <PreviewReagentSection article={article} />
      <PreviewLegalitySection article={article} />
      <PreviewCitationsSection article={article} />
    </div>
  );
});
