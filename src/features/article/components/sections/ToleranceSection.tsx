import { memo } from "react";
import Masonry from "react-masonry-css";
import { Icon, type IconName } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle } from "@/schema";
import { CitedText } from "../CitedText";

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
    <div id="tolerance" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:trending-up" title="Tolerance" />

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
              <p className="mt-2 text-sm text-white/90">
                <CitedText text={value} article={article} />
              </p>
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
              {tolerance.cross_tolerance.map((entry, index) => (
                <span key={`${entry}-${index}`}>
                  {index > 0 ? ", " : null}
                  <CitedText text={entry} article={article} />
                </span>
              ))}
            </p>
          </div>
        )}
      </Masonry>
    </div>
  );
});
