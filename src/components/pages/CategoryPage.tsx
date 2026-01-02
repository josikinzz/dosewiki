import { PageHeader } from "../sections/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { Button } from "@/components/ui/button";
import type { CategoryDetail } from "../../data/library";

interface CategoryPageProps {
  detail: CategoryDetail;
  onSelectDrug: (slug: string) => void;
}

export function CategoryPage({ detail, onSelectDrug }: CategoryPageProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
      <PageHeader
        title={detail.definition.name}
        icon={detail.definition.icon}
        description={`${detail.total} substance${detail.total === 1 ? "" : "s"} tagged in this category.`}
      />
      <div className="space-y-6">
        {detail.groups.map((group) => (
          <SectionCard key={group.name} delay={0.05}>
            <div className="flex items-center gap-3">
              <IconBadge icon={detail.definition.icon} label={detail.definition.name} />
              <h2 className="text-lg font-semibold text-fuchsia-300">{group.name}</h2>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-white/85">
              {group.drugs.map((drug) => (
                <li key={drug.slug}>
                  <Button
                    variant="listItem"
                    size="listItem"
                    onClick={() => onSelectDrug(drug.slug)}
                  >
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="hyphenate">{drug.name}</span>
                      {drug.alias && (
                        <span className="hyphenate text-xs text-white/55">({drug.alias})</span>
                      )}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}
        {detail.groups.length === 0 && (
          <SectionCard delay={0.05}>
            <p className="text-sm text-white/70">No compounds are currently mapped to this category.</p>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
