import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import { parseGeneratedYaml } from "./yamlParser";
import { EditorCitationDiagnosticsPanel } from "@/features/dev/forms/EditorCitationDiagnosticsPanel";
import {
  HeroSection,
  DosageDurationSection,
  SubjectiveEffectsSection,
  PharmacologySection,
  InteractionsSection,
  ToleranceSection,
  HistoryCultureSection,
  HarmPotentialSection,
  ReagentSection,
  LegalitySection,
  CitationsSection,
} from "@/features/article/components/sections";

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
      <HeroSection article={article} />
      <DosageDurationSection article={article} />
      <SubjectiveEffectsSection article={article} />
      <ReagentSection article={article} />
      <PharmacologySection article={article} />
      <InteractionsSection article={article} />
      <ToleranceSection article={article} />
      <HarmPotentialSection article={article} />
      <HistoryCultureSection article={article} />
      <LegalitySection article={article} />
      <CitationsSection article={article} />
    </div>
  );
});
