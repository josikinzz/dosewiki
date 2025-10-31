import type { LucideIcon } from "lucide-react";
import { AlertCircle, AlertTriangle, ShieldAlert, Skull } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { InteractionGroup } from "../../types/content";

interface InteractionsSectionProps {
  interactions: InteractionGroup[];
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

export function InteractionsSection({ interactions }: InteractionsSectionProps) {
  return (
    <SectionCard delay={0.2} className="space-y-4">
      <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
        <IconBadge icon={ShieldAlert} label="Interactions" />
        Interactions
      </h2>
      <div className="[column-gap:1.5rem] columns-1 md:columns-3">
        {interactions.map((group) => {
          const { border, bg, Icon, iconClass, label } = severityStyles[group.severity];
          return (
            <div
              key={group.label}
              className={`mb-4 break-inside-avoid break-inside-avoid-column rounded-xl p-4 ring-1 ring-white/10 ${border} ${bg} transition hover:border-white/20 hover:bg-white/12 last:mb-0`}
            >
              <h3 className="flex items-center gap-2 font-semibold">
                <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" focusable="false" />
                <span>{group.label}</span>
              </h3>
              <p className="mt-1 text-xs text-white/60">{label}</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-white/85">
                {group.items.map((item) => (
                  <li key={`${item.slug}-${item.raw}`} className="space-y-0.5">
                    <span>{item.display}</span>
                    {item.rationale && (
                      <span className="block text-xs text-white/60">{item.rationale}</span>
                    )}
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
