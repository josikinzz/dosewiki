import type { LucideIcon } from "lucide-react";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CircleSlash2,
  Merge,
  TrendingUp,
} from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { ToleranceEntry } from "../../types/content";

interface ToleranceSectionProps {
  tolerance: ToleranceEntry[];
}

const toleranceIconMap: Record<string, LucideIcon> = {
  "Full tolerance": ArrowUpWideNarrow,
  "Half tolerance": CircleSlash2,
  "Baseline reset": ArrowDownWideNarrow,
  "Cross tolerance": Merge,
};

export function ToleranceSection({ tolerance }: ToleranceSectionProps) {
  return (
    <SectionCard delay={0.25}>
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
          <IconBadge icon={TrendingUp} label="Tolerance" />
          Tolerance
        </h2>
      </div>
      <div className="mt-6 columns-1 gap-4 sm:columns-2">
        {tolerance.map((entry) => {
          const Icon = toleranceIconMap[entry.label];

          return (
            <article
              key={entry.label}
              className="mb-4 break-inside-avoid rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/85 shadow-[0_10px_30px_-18px_rgba(168,85,247,0.45)] transition hover:border-fuchsia-400/40 hover:bg-white/8 last:mb-0"
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                {Icon ? <Icon aria-hidden className="h-4 w-4 text-fuchsia-200" /> : null}
                {entry.label}
              </span>
              <p className="mt-2 text-base text-white/90">{entry.description}</p>
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
