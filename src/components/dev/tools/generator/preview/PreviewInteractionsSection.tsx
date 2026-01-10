import { memo } from "react";
import { AlertCircle, AlertTriangle, ExternalLink, ShieldAlert, Skull } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { SubstanceArticle } from "../../../../../schema";

interface PreviewInteractionsSectionProps {
  article: SubstanceArticle;
  /** Called when an interaction substance is clicked */
  onSelectInteraction?: (substance: string) => void;
}

const INTERACTION_CATEGORIES = [
  {
    key: "dangerous",
    label: "Dangerous",
    icon: Skull,
    borderClass: "border-rose-500/40",
    bgClass: "bg-rose-500/10",
    iconClass: "text-rose-300",
    definition: "These combinations are considered extremely harmful and should always be avoided. Reactions to these drugs taken in combination are highly unpredictable and have a potential to cause death.",
  },
  {
    key: "unsafe",
    label: "Unsafe",
    icon: AlertTriangle,
    borderClass: "border-orange-500/40",
    bgClass: "bg-orange-500/10",
    iconClass: "text-orange-300",
    definition: "There is considerable risk of physical harm when taking these combinations, they should be avoided where possible.",
  },
  {
    key: "caution",
    label: "Caution",
    icon: AlertCircle,
    borderClass: "border-amber-500/40",
    bgClass: "bg-amber-500/10",
    iconClass: "text-amber-300",
    definition: "These combinations are not usually physically harmful, but may produce undesirable effects, such as physical discomfort or overstimulation. Extreme use may cause physical health issues. Synergistic effects may be unpredictable. Care should be taken when choosing to use this combination.",
  },
] as const;

export const PreviewInteractionsSection = memo(function PreviewInteractionsSection({
  article,
  onSelectInteraction,
}: PreviewInteractionsSectionProps) {
  const { interactions } = article;

  const hasDangerous = interactions.dangerous.length > 0;
  const hasUnsafe = interactions.unsafe.length > 0;
  const hasCaution = interactions.caution.length > 0;

  if (!hasDangerous && !hasUnsafe && !hasCaution) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={ShieldAlert} label="Interactions" />
        Interactions
      </h2>

      {/* Single column layout */}
      <div className="flex flex-col gap-4">
        {INTERACTION_CATEGORIES.map(({ key, label, icon: Icon, borderClass, bgClass, iconClass, definition }) => {
          const items = interactions[key as keyof typeof interactions];
          if (items.length === 0) return null;

          return (
            <div
              key={key}
              className={`rounded-xl border p-4 ${borderClass} ${bgClass}`}
            >
              <h3 className="flex items-center gap-2 font-semibold text-white">
                <Icon className={`h-5 w-5 ${iconClass}`} />
                {label}
              </h3>
              <p className="mt-2 text-xs text-white/50 leading-relaxed">{definition}</p>
              <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              {(() => {
                // Parse all items and split into with/without rationale
                const parsed = items.map((item) => {
                  const match = item.match(/^(.+?)\s*\((.+)\)$/);
                  return {
                    raw: item,
                    substance: match ? match[1].trim() : item,
                    rationale: match ? match[2].trim() : null,
                  };
                });
                const withRationale = parsed.filter((p) => p.rationale);
                const withoutRationale = parsed.filter((p) => !p.rationale);

                return (
                  <div className="space-y-2.5">
                    {/* Items with rationales - alternating row backgrounds */}
                    {withRationale.map((item, idx) => (
                      <div
                        key={item.raw}
                        className={`rounded-lg px-3 py-2 ring-1 ring-white/10 ${
                          idx % 2 === 0 ? "bg-white/[0.03]" : "bg-white/[0.07]"
                        }`}
                      >
                        <span
                          className={`text-sm font-semibold text-white ${
                            onSelectInteraction ? "cursor-pointer hover:text-fuchsia-300 transition-colors" : ""
                          }`}
                          onClick={onSelectInteraction ? () => onSelectInteraction(item.substance) : undefined}
                        >
                          {item.substance}
                        </span>
                        <p className="mt-1 text-xs text-white/50 leading-relaxed">{item.rationale}</p>
                      </div>
                    ))}
                    {/* Items without rationales - horizontal chips */}
                    {withoutRationale.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {withoutRationale.map((item) => (
                          <span
                            key={item.raw}
                            className={`rounded-lg bg-white/5 px-2.5 py-1 text-sm font-medium text-white/85 ring-1 ring-white/10 ${
                              onSelectInteraction ? "cursor-pointer hover:text-fuchsia-300 hover:bg-white/10 transition-colors" : ""
                            }`}
                            onClick={onSelectInteraction ? () => onSelectInteraction(item.substance) : undefined}
                          >
                            {item.substance}
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
});
