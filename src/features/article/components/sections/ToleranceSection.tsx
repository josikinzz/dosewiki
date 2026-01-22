import { memo } from "react";
import Masonry from "react-masonry-css";
import { Icon, type IconName } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { IconBadge } from "@/components/common/IconBadge";
import type { SubstanceArticle } from "@/schema";

const MASONRY_BREAKPOINTS = {
  default: 2,
  640: 1,
};

interface ToleranceSectionProps {
  article: SubstanceArticle;
}

const TOLERANCE_ITEMS: Array<{ key: string; label: string; icon: IconName }> = [
  { key: "full_tolerance", label: "Full Tolerance", icon: "lucide:arrow-up-wide-narrow" },
  { key: "half_tolerance", label: "Half Tolerance", icon: "lucide:circle-slash-2" },
  { key: "baseline_tolerance", label: "Baseline Reset", icon: "lucide:arrow-down-wide-narrow" },
];

export const ToleranceSection = memo(function ToleranceSection({
  article,
}: ToleranceSectionProps) {
  const { tolerance } = article;

  const hasFull = tolerance?.full_tolerance?.trim().length > 0;
  const hasHalf = tolerance?.half_tolerance?.trim().length > 0;
  const hasBaseline = tolerance?.baseline_tolerance?.trim().length > 0;
  const hasCross = tolerance?.cross_tolerance?.length > 0;

  if (!hasFull && !hasHalf && !hasBaseline && !hasCross) {
    return null;
  }

  return (
    <div className="space-y-6 pt-12">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-fuchsia-500/20 blur-xl rounded-full" />
          <h2 className="relative flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300 whitespace-nowrap">
            <IconBadge icon="lucide:trending-up" />
            Tolerance
          </h2>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
      </div>

      <Masonry
        breakpointCols={MASONRY_BREAKPOINTS}
        className="flex w-full gap-4"
        columnClassName="flex flex-col gap-4"
      >
        {TOLERANCE_ITEMS.map(({ key, label, icon }) => {
          const value = tolerance[key as keyof typeof tolerance];
          if (typeof value !== "string" || value.trim().length === 0) return null;

          return (
            <div
              key={key}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-fuchsia-400/40 hover:bg-white/8"
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white">
                <Icon icon={icon} size={16} className="text-fuchsia-200" />
                {label}
              </span>
              <p className="mt-2 text-sm text-white/90">{value}</p>
            </div>
          );
        })}

        {/* Cross Tolerance */}
        {hasCross && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-fuchsia-400/40 hover:bg-white/8">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white">
              <Icon icon="lucide:merge" size={20} className="text-fuchsia-200" />
              Cross Tolerance
            </span>
            <p className="mt-2 text-sm text-white/90">
              {tolerance.cross_tolerance.join(", ")}
            </p>
          </div>
        )}
      </Masonry>
    </div>
  );
});
