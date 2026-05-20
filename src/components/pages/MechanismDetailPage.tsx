"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CategoryGrid } from "@/features/article/components/sections";
import { badgeVariants } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";
import { scrollIntoViewRespectingMotion } from "@/utils/navigation";
import type { DosageCategoryGroup, MechanismDetail } from "../../data/builders/library";
import { UNQUALIFIED_MECHANISM_QUALIFIER_KEY } from "../../data/constants";

interface MechanismDetailPageProps {
  detail: MechanismDetail;
  drugHrefPrefix?: string;
  categoryHrefPrefix?: string;
  onSelectDrug?: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
  activeQualifierSlug?: string;
}

function getSectionId(mechanismSlug: string, qualifierKey: string) {
  return `mechanism-${mechanismSlug}-${qualifierKey}`;
}

export function MechanismDetailPage({
  detail,
  drugHrefPrefix,
  categoryHrefPrefix,
  onSelectDrug,
  onSelectCategory,
  activeQualifierSlug,
}: MechanismDetailPageProps) {
  const { definition, qualifiers, defaultQualifierKey } = detail;
  const targetQualifierKey = activeQualifierSlug ?? defaultQualifierKey;
  const lastScrolledQualifierRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!targetQualifierKey) {
      return;
    }

    if (lastScrolledQualifierRef.current === targetQualifierKey) {
      return;
    }

    const element = document.getElementById(
      getSectionId(definition.slug, targetQualifierKey),
    );
    if (element) {
      scrollIntoViewRespectingMotion(element);
      lastScrolledQualifierRef.current = targetQualifierKey;
    }
  }, [definition.slug, targetQualifierKey]);

  const qualifierNav = qualifiers.length > 1;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-12">
      <PageHeader
        title={definition.name}
        icon="lucide:cog"
        description={`${definition.total} substance${definition.total === 1 ? "" : "s"} share this mechanism of action.`}
      />

      {qualifierNav ? (
        <div className="mt-6 flex flex-wrap gap-3 gap-fallback-wrap-3">
          {qualifiers.map((qualifier) => {
            const isActive = qualifier.key === targetQualifierKey;
            const qualifierSuffix = qualifier.label ?? "general";
            const displayLabel = `${definition.name} (${qualifierSuffix})`;
            const countLabel = `${qualifier.total}`;
            const qualifierHref = publicHref.mechanism(
              definition.slug,
              qualifier.key === defaultQualifierKey ? undefined : qualifier.key,
            );

            return (
              <Link
                key={qualifier.key}
                href={qualifierHref}
                className={cn(
                  badgeVariants({ variant: "effectInteractive" }),
                  "gap-2 gap-fallback-row-2",
                  isActive && "bg-fuchsia-500/25 text-white ring-fuchsia-400/40 hover:bg-fuchsia-500/25 hover:text-white"
                )}
              >
                <span>{displayLabel}</span>
                <span className="text-xs text-white/60">{countLabel}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="mt-10 space-y-12">
        {qualifiers.map((qualifier) => {
          const sectionId = getSectionId(definition.slug, qualifier.key);
          const qualifierSuffix = qualifier.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY
            ? "general"
            : qualifier.label ?? "general";
          const title = `${definition.name} (${qualifierSuffix})`;
          const subtitle = `${qualifier.total} substance${qualifier.total === 1 ? "" : "s"}`;
          const groups: DosageCategoryGroup[] = qualifier.groups;

          return (
            <Surface
              key={qualifier.key}
              asChild
              variant="muted"
              padding="lg"
              radius="xl"
              className="shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]"
            >
              <section id={sectionId}>
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {title}
                    </h2>
                    <p className="text-sm text-white/60">{subtitle}</p>
                  </div>
                </div>

                <div className="mt-6">
                  {groups.length > 0 ? (
                    <CategoryGrid
                      groups={groups}
                      drugHrefPrefix={drugHrefPrefix}
                      categoryHrefPrefix={categoryHrefPrefix}
                      onSelectDrug={onSelectDrug}
                      onSelectCategory={onSelectCategory}
                      hideEmptyGroups
                      limitColumns
                    />
                  ) : (
                    <Surface variant="muted" padding="sm" radius="lg" asChild>
                      <p className="text-sm text-white/70">
                        No categorized records available for this qualifier yet.
                      </p>
                    </Surface>
                  )}
                </div>
              </section>
            </Surface>
          );
        })}
      </div>
    </div>
  );
}
