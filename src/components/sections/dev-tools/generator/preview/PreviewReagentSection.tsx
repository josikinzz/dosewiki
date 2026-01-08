import { memo } from "react";
import { TestTubeDiagonal } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { GeneratedArticle } from "../../../../../types/generatorSchema";

interface PreviewReagentSectionProps {
  article: GeneratedArticle;
}

// Standard reagent display order
const REAGENT_ORDER = [
  "marquis",
  "mecke",
  "mandelin",
  "simon",
  "robadope",
  "froehde",
  "liebermann",
  "ehrlich",
  "hofmann",
  "folin",
  "gallic",
  "scott",
];

function capitalizeReagent(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const PreviewReagentSection = memo(function PreviewReagentSection({
  article,
}: PreviewReagentSectionProps) {
  const { reagent_testing } = article;

  const entries = Object.entries(reagent_testing).filter(
    ([, value]) => value.trim().length > 0
  );

  if (entries.length === 0) {
    return null;
  }

  // Sort by standard order
  const sortedEntries = entries.sort(([a], [b]) => {
    const aIdx = REAGENT_ORDER.indexOf(a.toLowerCase());
    const bIdx = REAGENT_ORDER.indexOf(b.toLowerCase());
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={TestTubeDiagonal} label="Reagent Testing" />
        Reagent Testing
      </h2>
      <p className="mb-4 text-sm text-white/60">
        Expected colorimetric results for common reagent tests.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sortedEntries.map(([reagent, result]) => {
          const isNoReaction = result.toLowerCase().includes("no reaction");

          return (
            <div
              key={reagent}
              className={`rounded-xl border p-3 transition ${
                isNoReaction
                  ? "border-white/10 bg-white/5"
                  : "border-fuchsia-500/20 bg-fuchsia-500/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-white">
                  {capitalizeReagent(reagent)}
                </span>
              </div>
              <p
                className={`mt-1 text-sm ${
                  isNoReaction ? "text-white/50" : "text-white/80"
                }`}
              >
                {result}
              </p>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
});
