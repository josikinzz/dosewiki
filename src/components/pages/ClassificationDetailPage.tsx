import Link from "next/link";

import { SectionCard } from "../common/SectionCard";
import type { IconName } from "../common/Icon";
import { PageHeader } from "../layout/PageHeader";
import {
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import type { ClassificationDetail } from "../../data/builders/library";
import { publicHref } from "@/utils/publicHref";

type ClassificationMeta = {
  label: string;
  icon: IconName;
};

const CLASSIFICATION_META: Record<
  ClassificationDetail["type"],
  ClassificationMeta
> = {
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
}

const LONG_LIST_THRESHOLD = 16;

function getDrugHref(slug: string, drugHrefPrefix?: string) {
  return drugHrefPrefix
    ? `${drugHrefPrefix}${slug}`
    : publicHref.substance(slug);
}

function getInitial(label: string) {
  const first = label.trim().charAt(0).toUpperCase();
  return /^[A-Z0-9]$/.test(first) ? first : "#";
}

function buildDrugGroups(detail: ClassificationDetail) {
  const sortedDrugs = [...detail.drugs].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  if (sortedDrugs.length < LONG_LIST_THRESHOLD) {
    return [
      {
        id: `${detail.type}-${detail.slug}-all`,
        title: "Substances",
        drugs: sortedDrugs,
      },
    ];
  }

  const grouped = new Map<string, typeof sortedDrugs>();

  sortedDrugs.forEach((drug) => {
    const initial = getInitial(drug.name);
    const drugs = grouped.get(initial) ?? [];
    drugs.push(drug);
    grouped.set(initial, drugs);
  });

  return Array.from(grouped.entries()).map(([initial, drugs]) => ({
    id: `${detail.type}-${detail.slug}-${initial}`,
    title: initial,
    drugs,
  }));
}

export function ClassificationDetailPage({
  detail,
  drugHrefPrefix,
}: ClassificationDetailPageProps) {
  const meta = CLASSIFICATION_META[detail.type];
  const description = `${detail.total.toLocaleString()} substance${detail.total === 1 ? "" : "s"} share this ${meta.label.toLowerCase()} tag.`;
  const groups = buildDrugGroups(detail);
  const isLongList = detail.drugs.length >= LONG_LIST_THRESHOLD;

  return (
    <PublicContentShell focusTarget width="wide">
      <PageHeader
        title={detail.label}
        icon={meta.icon}
        description={description}
      />
      <SectionCard className="mt-8">
        <PublicSectionHeading
          variant="card"
          icon={meta.icon}
          iconLabel={meta.label}
          title={
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span>{meta.label}</span>
              <span className="theme-text-muted text-sm font-medium">
                {detail.total.toLocaleString()} linked substance{detail.total === 1 ? "" : "s"}
              </span>
            </span>
          }
        />

        {detail.drugs.length > 0 ? (
          <div
            className={
              isLongList
                ? "mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
                : "mt-5 max-w-2xl"
            }
          >
            {groups.map((group) => (
              <section
                key={group.id}
                aria-labelledby={`${group.id}-heading`}
                className="rounded-2xl border border-[color:var(--theme-border)] bg-[color:color-mix(in_srgb,var(--theme-surface-muted)_62%,transparent)] p-3"
              >
                <h2
                  id={`${group.id}-heading`}
                  aria-label={`${group.title}${group.drugs.length}`}
                  className="theme-text-primary mb-3 flex items-center justify-between gap-3 px-1 text-sm font-bold"
                >
                  <span>{group.title}</span>
                  <span className="theme-text-muted text-xs font-semibold">
                    {group.drugs.length}
                  </span>
                </h2>
                <ul className="space-y-2">
                  {group.drugs.map((drug) => (
                    <li key={drug.slug}>
                      <Link
                        href={getDrugHref(drug.slug, drugHrefPrefix)}
                        className="theme-text-secondary flex min-w-0 w-full items-center rounded-xl px-3 py-2 text-sm font-medium transition-[background-color,color,transform] hover:translate-x-0.5 hover:bg-[color:color-mix(in_srgb,var(--theme-surface-muted)_74%,transparent)] hover:text-[color:var(--theme-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]"
                      >
                        <span className="theme-taxonomy-link-label min-w-0 break-words">
                          {drug.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="theme-text-muted mt-4 text-sm">
            No public substances currently map to this tag.
          </p>
        )}
      </SectionCard>
    </PublicContentShell>
  );
}
