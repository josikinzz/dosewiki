import { PublicChipNav } from "@/components/common/PublicTokens";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import { Surface } from "@/components/ui/surface";
import { publicHref } from "@/utils/publicHref";
import type { DosageCategoryGroup, MechanismDetail } from "../../data/builders/library";
import { UNQUALIFIED_MECHANISM_QUALIFIER_KEY } from "../../data/constants";
import { MechanismQualifierScroll } from "./MechanismQualifierScroll";
import { getMechanismSectionId } from "./mechanismSectionId";

interface MechanismDetailPageProps {
  detail: MechanismDetail;
  drugHrefPrefix?: string;
  categoryHrefPrefix?: string;
  activeQualifierSlug?: string;
}

export function MechanismDetailPage({
  detail,
  drugHrefPrefix,
  categoryHrefPrefix,
  activeQualifierSlug,
}: MechanismDetailPageProps) {
  const { definition, qualifiers, defaultQualifierKey } = detail;
  const targetQualifierKey = activeQualifierSlug ?? defaultQualifierKey;
  const qualifierNav = qualifiers.length > 1;
  const orderedQualifiers = activeQualifierSlug
    ? qualifiers.filter((qualifier) => qualifier.key === targetQualifierKey)
    : qualifiers;

  return (
    <PublicContentShell width="wide" focusTarget>
      <MechanismQualifierScroll
        mechanismSlug={definition.slug}
        qualifierKey={targetQualifierKey}
      />
      <PageHeader
        title={definition.name}
        icon="lucide:cog"
        description={`${definition.total} substance${definition.total === 1 ? "" : "s"} share this mechanism of action.`}
      />

      {qualifierNav ? (
        <PublicChipNav
          ariaLabel="Mechanism qualifiers"
          className="mt-6"
          items={qualifiers.map((qualifier) => {
            const qualifierSuffix = qualifier.label ?? "general";
            const displayLabel = `${definition.name} (${qualifierSuffix})`;

            return {
              id: qualifier.key,
              label: displayLabel,
              count: qualifier.total,
              href: publicHref.mechanism(
                definition.slug,
                qualifier.key === defaultQualifierKey
                  ? undefined
                  : qualifier.key,
              ),
              active: qualifier.key === targetQualifierKey,
            };
          })}
        />
      ) : null}

      <div className="mt-10 space-y-12">
        {orderedQualifiers.map((qualifier) => {
          const sectionId = getMechanismSectionId(definition.slug, qualifier.key);
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
              className="shadow-[var(--theme-elevation-panel-deep)]"
            >
              <section id={sectionId} className="scroll-mt-28 md:scroll-mt-32">
                <PublicSectionHeading
                  variant="card"
                  icon="lucide:cog"
                  iconLabel="Mechanism qualifier"
                  title={title}
                  titleElement="h2"
                  actions={
                    <span className="theme-text-faint text-sm">
                      {subtitle}
                    </span>
                  }
                />

                <div className="mt-6">
                  {groups.length > 0 ? (
                    <CategoryGrid
                      groups={groups}
                      drugHrefPrefix={drugHrefPrefix}
                      categoryHrefPrefix={categoryHrefPrefix}
                      hideEmptyGroups
                      limitColumns
                    />
                  ) : (
                    <Surface variant="muted" padding="sm" radius="lg" asChild>
                      <p className="theme-text-secondary text-sm">
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
    </PublicContentShell>
  );
}
