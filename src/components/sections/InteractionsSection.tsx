import type { LucideIcon } from "lucide-react";
import { AlertCircle, AlertTriangle, ShieldAlert, Skull } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { InteractionGroup } from "../../types/content";

interface InteractionsSectionProps {
  interactions: InteractionGroup[];
  layoutVariant?: "masonry" | "stacked";
}

const severityStyles: Record<InteractionGroup["severity"], { border: string; bg: string; Icon: LucideIcon; iconClass: string; label: string }> = {
  danger: {
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
    Icon: Skull,
    iconClass: "text-rose-200",
    label: "High risk interaction",
  },
  unsafe: {
    border: "border-rose-400/35",
    bg: "bg-rose-400/10",
    Icon: AlertTriangle,
    iconClass: "text-rose-200",
    label: "Unsafe combination",
  },
  caution: {
    border: "border-rose-300/30",
    bg: "bg-rose-300/10",
    Icon: AlertCircle,
    iconClass: "text-rose-200",
    label: "Use caution",
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
          const { border, bg, Icon, iconClass } = severityStyles[group.severity];
          return (
            <div
              key={group.label}
              className={`${cardSpacingClasses} rounded-xl p-4 ring-1 ring-white/10 ${border} ${bg} transition hover:border-white/20 hover:bg-white/12`}
            >
              <h3 className="flex items-center gap-2 font-semibold">
                <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" focusable="false" />
                <span>{group.label}</span>
              </h3>
              <ul className="mt-2 list-inside list-disc space-y-2 text-sm text-white/85">
                {group.items.map((item) => (
                  <li key={`${item.slug}-${item.raw}`} className="leading-snug">
                    <span className="font-semibold text-white">{item.display}</span>
                    {item.rationale ? (
                      <span className="text-white/60"> - {item.rationale}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
