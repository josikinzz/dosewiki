import Link from "next/link";
import type { IconName } from "../common/Icon";
import { PageHeader } from "../layout/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { Button } from "@/components/ui/button";
import type { ClassificationDetail } from "../../data/builders/library";

type ClassificationMeta = {
  label: string;
  icon: IconName;
};

const CLASSIFICATION_META: Record<ClassificationDetail["type"], ClassificationMeta> = {
  psychoactive: {
    label: "Psychoactive class",
    icon: "lucide:brain-circuit",
  },
  chemical: {
    label: "Chemical class",
    icon: "lucide:hexagon",
  },
};

interface ClassificationDetailPageProps {
  detail: ClassificationDetail;
  drugHrefPrefix?: string;
  onSelectDrug?: (slug: string) => void;
}

export function ClassificationDetailPage({ detail, drugHrefPrefix, onSelectDrug }: ClassificationDetailPageProps) {
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
                {drugHrefPrefix ? (
                  <Button variant="listItem" size="listItem" asChild>
                    <Link href={`${drugHrefPrefix}${drug.slug}`}>{drug.name}</Link>
                  </Button>
                ) : (
                  <Button
                    variant="listItem"
                    size="listItem"
                    onClick={() => onSelectDrug?.(drug.slug)}
                  >
                    {drug.name}
                  </Button>
                )}
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
