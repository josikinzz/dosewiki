import { memo } from "react";
import Masonry from "react-masonry-css";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CircleSlash2,
  Merge,
  TrendingUp,
} from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { GeneratedArticle } from "../../../../../types/generatorSchema";

const MASONRY_BREAKPOINTS = {
  default: 2,
  640: 1,
};

interface PreviewToleranceSectionProps {
  article: GeneratedArticle;
}

const TOLERANCE_ITEMS = [
  { key: "full_tolerance", label: "Full Tolerance", icon: ArrowUpWideNarrow },
  { key: "half_tolerance", label: "Half Tolerance", icon: CircleSlash2 },
  { key: "baseline_tolerance", label: "Baseline Reset", icon: ArrowDownWideNarrow },
] as const;

export const PreviewToleranceSection = memo(function PreviewToleranceSection({
  article,
}: PreviewToleranceSectionProps) {
  const { tolerance } = article;

  const hasFull = tolerance.full_tolerance.trim().length > 0;
  const hasHalf = tolerance.half_tolerance.trim().length > 0;
  const hasBaseline = tolerance.baseline_tolerance.trim().length > 0;
  const hasCross = tolerance.cross_tolerance.length > 0;

  if (!hasFull && !hasHalf && !hasBaseline && !hasCross) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={TrendingUp} label="Tolerance" />
        Tolerance
      </h2>

      <Masonry
        breakpointCols={MASONRY_BREAKPOINTS}
        className="flex w-full gap-4"
        columnClassName="flex flex-col gap-4"
      >
        {TOLERANCE_ITEMS.map(({ key, label, icon: Icon }) => {
          const value = tolerance[key as keyof typeof tolerance];
          if (typeof value !== "string" || value.trim().length === 0) return null;

          return (
            <div
              key={key}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-fuchsia-400/40 hover:bg-white/8"
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                <Icon className="h-4 w-4 text-fuchsia-200" />
                {label}
              </span>
              <p className="mt-2 text-sm text-white/90">{value}</p>
            </div>
          );
        })}

        {/* Cross Tolerance */}
        {hasCross && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-fuchsia-400/40 hover:bg-white/8">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              <Merge className="h-4 w-4 text-fuchsia-200" />
              Cross Tolerance
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tolerance.cross_tolerance.map((item, idx) => (
                <span
                  key={idx}
                  className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </Masonry>
    </SectionCard>
  );
});
