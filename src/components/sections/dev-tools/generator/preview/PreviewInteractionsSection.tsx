import { memo } from "react";
import { AlertCircle, AlertTriangle, ShieldAlert, Skull } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { GeneratedArticle } from "../../../../../types/generatorSchema";

interface PreviewInteractionsSectionProps {
  article: GeneratedArticle;
}

const INTERACTION_CATEGORIES = [
  {
    key: "dangerous",
    label: "Dangerous",
    icon: Skull,
    borderClass: "border-rose-500/40",
    bgClass: "bg-rose-500/10",
    iconClass: "text-rose-300",
  },
  {
    key: "unsafe",
    label: "Unsafe",
    icon: AlertTriangle,
    borderClass: "border-orange-500/40",
    bgClass: "bg-orange-500/10",
    iconClass: "text-orange-300",
  },
  {
    key: "caution",
    label: "Caution",
    icon: AlertCircle,
    borderClass: "border-amber-500/40",
    bgClass: "bg-amber-500/10",
    iconClass: "text-amber-300",
  },
] as const;

export const PreviewInteractionsSection = memo(function PreviewInteractionsSection({
  article,
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

      <div className="grid gap-4 md:grid-cols-3">
        {INTERACTION_CATEGORIES.map(({ key, label, icon: Icon, borderClass, bgClass, iconClass }) => {
          const items = interactions[key as keyof typeof interactions];
          if (items.length === 0) return null;

          return (
            <div
              key={key}
              className={`rounded-xl border p-4 ${borderClass} ${bgClass}`}
            >
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                <Icon className={`h-5 w-5 ${iconClass}`} />
                {label}
              </h3>
              <ul className="space-y-2">
                {items.map((item, idx) => {
                  // Parse item for substance and rationale (format: "Substance (reason)")
                  const match = item.match(/^(.+?)\s*\((.+)\)$/);
                  const substance = match ? match[1].trim() : item;
                  const rationale = match ? match[2].trim() : null;

                  return (
                    <li key={idx} className="text-sm leading-snug">
                      <span className="font-medium text-white">{substance}</span>
                      {rationale && (
                        <span className="text-white/60"> - {rationale}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
});
