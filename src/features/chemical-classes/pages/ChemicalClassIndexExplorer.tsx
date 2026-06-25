"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { PublicSegmentedTabs, type PublicSegmentedTabItem } from "@/components/layout/PublicSegmentedTabs";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import { CategoryIntro } from "@/components/pages/CategoryIntro";
import { StateCard } from "@/components/common/StateCard";
import { useTabHashSync, writeTabHash } from "@/hooks/useTabHashSync";
import { icons } from "@/utils/iconNames";
import { cn } from "@/lib/utils";
import { MoleculeMarquee } from "../components/MoleculeMarquee";
import type { ChemicalClassIndexEntry } from "../types";

const CHEMICAL_CLASS_INDEX_ICON = icons.hexagon;

interface ChemicalClassIndexExplorerProps {
  entries: ChemicalClassIndexEntry[];
}

/**
 * Client explorer for the Chemical Class Index. One tab per curated chemical
 * class (app-icon grid on mobile); selecting a tab shows that class's chemistry
 * blurb and its substances as substance-index-style panels grouped by
 * psychoactive class. The active tab is mirrored to the URL hash so chemical
 * class badges can deep-link straight to a class.
 */
export function ChemicalClassIndexExplorer({ entries }: ChemicalClassIndexExplorerProps) {
  const [activeKey, setActiveKey] = useState(() => entries[0]?.key ?? "");

  const entryByKey = useMemo(
    () => new Map(entries.map((entry) => [entry.key, entry])),
    [entries],
  );

  useTabHashSync({
    setValue: setActiveKey,
    isValid: (value) => entryByKey.has(value),
  });

  const handleSelect = (value: string) => {
    setActiveKey(value);
    writeTabHash(value);
  };

  const tabItems = useMemo<PublicSegmentedTabItem[]>(
    () => entries.map((entry) => ({ id: entry.key, label: entry.label, icon: entry.icon })),
    [entries],
  );

  const activeEntry = entryByKey.get(activeKey) ?? entries[0];
  const panels = activeEntry?.panels ?? [];

  return (
    <PublicContentShell width="wide" focusTarget className="max-w-none 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <PageHeader
          className="sm:mb-8"
          title="Chemical Class Index"
          icon={CHEMICAL_CLASS_INDEX_ICON}
          prominentMobileIcon
          showSpotlight={false}
        />
      </div>

      {entries.length === 0 ? (
        <StateCard
          badge="No classes"
          badgeVariant="secondary"
          title="No chemical classes found"
          description="No substances with a recognized chemical class have been published yet."
          icon="lucide:hexagon"
          tone="neutral"
        />
      ) : (
        <>
          <PublicSegmentedTabs
            ariaLabel="Filter substances by chemical class"
            value={activeKey}
            onValueChange={handleSelect}
            items={tabItems}
            mobileVariant="appGrid"
            mobileClassName="-mt-8"
            listClassName="justify-center"
          />

          {/* Tabs → hairline rule → class definition → molecule gallery. The
              divider and prose live in CategoryIntro (divider sits below the
              tabs); the gallery follows the text. */}
          <CategoryIntro
            content={activeEntry?.description ? { definition: activeEntry.description } : undefined}
            activeTab={activeKey}
          />

          {activeEntry?.molecules?.length ? (
            <div key={activeKey} className="theme-section-card-enter mt-2 sm:mt-3">
              <MoleculeMarquee
                molecules={activeEntry.molecules}
                featuredCount={activeEntry.featuredCount}
                label={activeEntry.label}
              />
            </div>
          ) : null}

          <div
            className={cn(
              "mt-6 sm:mt-10",
              panels.length === 1
                ? "mx-auto w-full max-w-xl"
                : panels.length === 2
                  ? "mx-auto w-full max-w-4xl"
                  : undefined,
            )}
          >
            <CategoryGrid
              key={activeKey}
              groups={panels}
              drugHrefPrefix="/"
              maxColumns={3}
            />
          </div>
        </>
      )}
    </PublicContentShell>
  );
}
