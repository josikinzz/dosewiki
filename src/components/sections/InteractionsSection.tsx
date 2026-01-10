import type { LucideIcon } from "lucide-react";
import { AlertCircle, AlertTriangle, ExternalLink, ShieldAlert, Skull } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { InteractionGroup } from "../../types/content";

interface InteractionsSectionProps {
  interactions: InteractionGroup[];
  layoutVariant?: "masonry" | "stacked";
}

const severityStyles: Record<InteractionGroup["severity"], { border: string; bg: string; Icon: LucideIcon; iconClass: string; label: string; definition: string }> = {
  danger: {
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
    Icon: Skull,
    iconClass: "text-rose-200",
    label: "Dangerous",
    definition: "These combinations are considered extremely harmful and should always be avoided. Reactions to these drugs taken in combination are highly unpredictable and have a potential to cause death.",
  },
  unsafe: {
    border: "border-rose-400/35",
    bg: "bg-rose-400/10",
    Icon: AlertTriangle,
    iconClass: "text-rose-200",
    label: "Unsafe",
    definition: "There is considerable risk of physical harm when taking these combinations, they should be avoided where possible.",
  },
  caution: {
    border: "border-rose-300/30",
    bg: "bg-rose-300/10",
    Icon: AlertCircle,
    iconClass: "text-rose-200",
    label: "Caution",
    definition: "These combinations are not usually physically harmful, but may produce undesirable effects, such as physical discomfort or overstimulation. Extreme use may cause physical health issues. Synergistic effects may be unpredictable. Care should be taken when choosing to use this combination.",
  },
};

export function InteractionsSection({ interactions, layoutVariant = "masonry" }: InteractionsSectionProps) {
  const isStacked = layoutVariant === "stacked";
  const containerClasses = isStacked ? "flex flex-col gap-4" : "[column-gap:1.5rem] columns-1 md:columns-3";
  const cardSpacingClasses = isStacked ? "" : "mb-4 break-inside-avoid break-inside-avoid-column last:mb-0";

  return (
    <SectionCard delay={0.2} className="space-y-4">
      <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
        <IconBadge icon={ShieldAlert} label="Interactions" />
        Interactions
      </h2>
      <div className={containerClasses}>
        {interactions.map((group) => {
          const { border, bg, Icon, iconClass, label, definition } = severityStyles[group.severity];
          return (
            <div
              key={group.label}
              className={`${cardSpacingClasses} rounded-xl p-4 ring-1 ring-white/10 ${border} ${bg} transition hover:border-white/20 hover:bg-white/12`}
            >
              <h3 className="flex items-center gap-2 font-semibold">
                <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" focusable="false" />
                <span>{label}</span>
              </h3>
              <p className="mt-2 text-xs text-white/50 leading-relaxed">{definition}</p>
              {(() => {
                const withRationale = group.items.filter((item) => item.rationale);
                const withoutRationale = group.items.filter((item) => !item.rationale);
                return (
                  <div className="mt-3 space-y-2.5">
                    {/* Items with rationales - alternating row backgrounds */}
                    {withRationale.map((item, idx) => (
                      <div
                        key={`${item.slug}-${item.raw}`}
                        className={`rounded-lg px-3 py-2 ring-1 ring-white/10 ${
                          idx % 2 === 0 ? "bg-white/[0.03]" : "bg-white/[0.07]"
                        }`}
                      >
                        <span className="text-sm font-semibold text-white">{item.display}</span>
                        <p className="mt-1 text-xs text-white/50 leading-relaxed">{item.rationale}</p>
                      </div>
                    ))}
                    {/* Items without rationales - horizontal chips */}
                    {withoutRationale.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {withoutRationale.map((item) => (
                          <span
                            key={`${item.slug}-${item.raw}`}
                            className="rounded-lg bg-white/5 px-2.5 py-1 text-sm font-medium text-white/85 ring-1 ring-white/10"
                          >
                            {item.display}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Attribution footer */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="text-xs text-white/50">Powered by</span>
        <img src="/favicons/tripsit.png" alt="" className="h-5 w-5 rounded -mr-1" />
        <a
          href="https://combo.tripsit.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-fuchsia-200 transition hover:text-fuchsia-100"
        >
          TripSit
        </a>
        <ExternalLink className="h-3 w-3 text-white/40" aria-hidden="true" />
      </div>
    </SectionCard>
  );
}
