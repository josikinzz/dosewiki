import { memo } from "react";
import { Icon } from "../../../common/Icon";
import { parseGeneratedYaml } from "./yamlParser";
import { HeroSection } from "../../../sections/HeroSection";
import { DosageDurationSection } from "../../../sections/DosageDurationSection";
import { SubjectiveEffectsSection } from "../../../sections/SubjectiveEffectsSection";
import { PharmacologySection } from "../../../sections/PharmacologySection";
import { InteractionsSection } from "../../../sections/InteractionsSection";
import { ToleranceSection } from "../../../sections/ToleranceSection";
import { HistoryCultureSection } from "../../../sections/HistoryCultureSection";
import { HarmPotentialSection } from "../../../sections/HarmPotentialSection";
import { ReagentSection } from "../../../sections/ReagentSection";
import { LegalitySection } from "../../../sections/LegalitySection";
import { CitationsSection } from "../../../sections/CitationsSection";

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
          <Icon icon="lucide:alert-triangle" className="h-5 w-5" size={20} />
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
