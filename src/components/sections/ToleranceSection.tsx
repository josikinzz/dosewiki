import { Gauge } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { ToleranceEntry } from "../../types/content";

interface ToleranceSectionProps {
  tolerance: ToleranceEntry[];
}

export function ToleranceSection({ tolerance }: ToleranceSectionProps) {
  return (
    <SectionCard delay={0.25}>
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
          <IconBadge icon={Gauge} label="Tolerance" />
          Tolerance
        </h2>
      </div>
      <div className="mt-6 space-y-4">
        {tolerance.map((entry) => (
          <article
            key={entry.label}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/85 shadow-[0_10px_30px_-18px_rgba(168,85,247,0.45)] transition hover:border-fuchsia-400/40 hover:bg-white/8"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
              {entry.label}
            </span>
            <p className="mt-2 text-base text-white/90">{entry.description}</p>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
