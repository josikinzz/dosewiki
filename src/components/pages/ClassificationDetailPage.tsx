import { BrainCircuit, Hexagon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "../sections/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { ClassificationDetail } from "../../data/library";

type ClassificationMeta = {
  label: string;
  icon: LucideIcon;
};

const CLASSIFICATION_META: Record<ClassificationDetail["type"], ClassificationMeta> = {
  psychoactive: {
    label: "Psychoactive class",
    icon: BrainCircuit,
  },
  chemical: {
    label: "Chemical class",
    icon: Hexagon,
  },
};

interface ClassificationDetailPageProps {
  detail: ClassificationDetail;
  onSelectDrug: (slug: string) => void;
}

export function ClassificationDetailPage({ detail, onSelectDrug }: ClassificationDetailPageProps) {
  const meta = CLASSIFICATION_META[detail.type];
  const description = `${detail.total.toLocaleString()} substance${detail.total === 1 ? "" : "s"} share this ${meta.label.toLowerCase()} tag.`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
      <PageHeader title={detail.label} icon={meta.icon} description={description} />
      <SectionCard delay={0.05}>
        <div className="flex items-center gap-3">
          <IconBadge icon={meta.icon} label={meta.label} />
          <h2 className="text-lg font-semibold text-fuchsia-300">{meta.label}</h2>
        </div>
        {detail.drugs.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-white/85">
            {detail.drugs.map((drug) => (
              <li key={drug.slug}>
                <button
                  type="button"
                  onClick={() => onSelectDrug(drug.slug)}
                  className="w-full rounded-xl px-3 py-2 text-left text-white/85 transition hover:bg-white/10 hover:text-fuchsia-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="hyphenate">{drug.name}</span>
                    {drug.alias && (
                      <span className="hyphenate text-xs text-white/55">({drug.alias})</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-white/70">No public substances currently map to this tag.</p>
        )}
      </SectionCard>
    </div>
  );
}
