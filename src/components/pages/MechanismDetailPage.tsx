import { useEffect, useRef } from "react";
import { Cog } from "lucide-react";
import { PageHeader } from "../sections/PageHeader";
import { CategoryGrid } from "../sections/CategoryGrid";
import { BADGE_INTERACTIVE_CLASSES } from "../common/badgeStyles";
import type { DosageCategoryGroup, MechanismDetail } from "../../data/library";
import { UNQUALIFIED_MECHANISM_QUALIFIER_KEY } from "../../data/library";

interface MechanismDetailPageProps {
  detail: MechanismDetail;
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
  onSelectMechanism?: (mechanismSlug: string, qualifierSlug?: string) => void;
  activeQualifierSlug?: string;
}

const ACTIVE_QUALIFIER_CLASSES =
  "bg-fuchsia-500/25 text-white ring-fuchsia-400/40 hover:bg-fuchsia-500/25 hover:text-white";

function getSectionId(mechanismSlug: string, qualifierKey: string) {
  return `mechanism-${mechanismSlug}-${qualifierKey}`;
}

export function MechanismDetailPage({
  detail,
  onSelectDrug,
  onSelectCategory,
  onSelectMechanism,
  activeQualifierSlug,
}: MechanismDetailPageProps) {
  const { definition, qualifiers, defaultQualifierKey } = detail;
  const targetQualifierKey = activeQualifierSlug ?? defaultQualifierKey;
  const lastScrolledQualifierRef = useRef<string | undefined>();

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
      const prefersSmoothScroll = typeof document !== "undefined" &&
        "scrollBehavior" in document.documentElement.style;
      if (prefersSmoothScroll) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        element.scrollIntoView();
      }
      lastScrolledQualifierRef.current = targetQualifierKey;
    }
  }, [definition.slug, targetQualifierKey]);

  const handleQualifierSelect = (key: string) => {
    if (!onSelectMechanism) {
      return;
    }
    const qualifierSlug = key === defaultQualifierKey ? undefined : key;
    onSelectMechanism(definition.slug, qualifierSlug);
  };

  const qualifierNav = qualifiers.length > 1;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-12">
      <PageHeader
        title={definition.name}
        icon={Cog}
        description={`${definition.total} substance${definition.total === 1 ? "" : "s"} share this mechanism of action.`}
      />

      {qualifierNav ? (
        <div className="mt-6 flex flex-wrap gap-3 gap-fallback-wrap-3">
          {qualifiers.map((qualifier) => {
            const isActive = qualifier.key === targetQualifierKey;
            const qualifierSuffix = qualifier.label ?? "general";
            const displayLabel = `${definition.name} (${qualifierSuffix})`;
            const countLabel = `${qualifier.total}`;

            return (
              <button
                key={qualifier.key}
                type="button"
                onClick={() => handleQualifierSelect(qualifier.key)}
                className={`${BADGE_INTERACTIVE_CLASSES} ${
                  isActive ? ACTIVE_QUALIFIER_CLASSES : ""
                } inline-flex items-center gap-2 gap-fallback-row-2`}
              >
                <span>{displayLabel}</span>
                <span className="text-xs text-white/60">{countLabel}</span>
              </button>
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
            <section
              key={qualifier.key}
              id={sectionId}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {title}
                  </h2>
                  <p className="font-display text-sm text-white/60">{subtitle}</p>
                </div>
              </div>

              <div className="mt-6">
                {groups.length > 0 ? (
                  <CategoryGrid
                    groups={groups}
                    onSelectDrug={onSelectDrug}
                    onSelectCategory={onSelectCategory}
                    hideEmptyGroups
                    limitColumns
                  />
                ) : (
                  <p className="rounded-xl bg-white/5 p-4 text-sm text-white/70">
                    No categorized records available for this qualifier yet.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
