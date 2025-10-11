import { PageHeader } from "../sections/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { CategoryDetail } from "../../data/library";

interface CategoryPageProps {
  detail: CategoryDetail;
  onSelectDrug: (slug: string) => void;
}

export function CategoryPage({ detail, onSelectDrug }: CategoryPageProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10">
      <PageHeader
        title={detail.definition.name}
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
