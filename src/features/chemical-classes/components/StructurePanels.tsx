"use client";

import { useMemo, useState } from "react";
import { SmartLink } from "@/components/common/SmartLink";
import { useT } from "@/i18n/client";

import { MoleculeImage } from "@/components/pages/MoleculeImage";
import { Icon } from "@/components/common/Icon";
import { icons } from "@/utils/iconNames";
import type { DosageCategoryGroup } from "@/data/builders/library";
import type { ChemicalClassMolecule } from "../types";

/**
 * Substance panels with the skeletal structure embedded in every row, so a
 * class page reads like a visual comparison table: names on the left, aligned
 * structures on the right. Free-floating sections grouped by psychoactive
 * class; hairline dividers instead of table chrome.
 */

/** Rows shown per panel before the "Show all" control takes over. */
const ROW_CAP = 8;
/** Don't bother collapsing for a rounding error's worth of extra rows. */
const CAP_SLACK = 2;

interface StructurePanelsProps {
  panels: DosageCategoryGroup[];
  /** Every structure SVG in the class, used to join url by substance slug. */
  molecules: ChemicalClassMolecule[];
}

function StructureRow({
  name,
  slug,
  structureUrl,
}: {
  name: string;
  slug: string;
  structureUrl?: string;
}) {
  const t = useT();

  return (
    <li>
      <SmartLink
        href={`/${slug}`}
        className="group flex min-h-14 items-center justify-between gap-4 rounded-xl px-3 py-1.5 transition-[background-color] duration-200 hover:bg-dose-surface-muted theme-focus-ring-inset"
      >
        <span className="theme-text-secondary min-w-0 text-[0.9375rem] font-medium leading-snug transition-colors duration-200 group-hover:text-dose-text">
          {name}
        </span>
        <span className="flex h-20 w-40 shrink-0 items-center justify-center sm:w-48">
          {structureUrl ? (
            <MoleculeImage
              src={structureUrl}
              alt={t("{{substance}} molecule structure", { substance: name })}
              width={220}
              height={100}
              className="theme-molecule-image max-h-[4.5rem] w-auto max-w-full object-contain"
            />
          ) : null}
        </span>
      </SmartLink>
    </li>
  );
}

function StructurePanel({
  panel,
  structureBySlug,
}: {
  panel: DosageCategoryGroup;
  structureBySlug: Map<string, string>;
}) {
  const t = useT();
  const panelName = t(panel.name);

  const [expanded, setExpanded] = useState(false);
  const collapsible = panel.drugs.length > ROW_CAP + CAP_SLACK;
  const visibleDrugs = collapsible && !expanded ? panel.drugs.slice(0, ROW_CAP) : panel.drugs;

  return (
    <section
      aria-label={t("{{category}} substances", { category: panelName })}
      className="min-w-0"
    >
      <header className="flex items-center gap-2.5 px-3">
        <Icon icon={panel.icon} size={18} className="theme-text-secondary shrink-0" />
        <h3 className="theme-text-primary font-[family-name:var(--font-family-display)] text-base font-semibold tracking-[0.01em]">
          {panelName}
          <span className="theme-text-faint ml-2 font-sans text-sm font-normal">
            · {panel.total}
          </span>
        </h3>
      </header>

      <ul className="divide-dose-divider mt-2 divide-y">
        {visibleDrugs.map((drug) => (
          <StructureRow
            key={drug.slug}
            name={drug.name}
            slug={drug.slug}
            structureUrl={structureBySlug.get(drug.slug)}
          />
        ))}
      </ul>

      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="theme-text-faint mt-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors duration-200 hover:text-dose-text theme-focus-ring"
        >
          <Icon icon={expanded ? icons.chevronUp : icons.chevronDown} size={14} />
          {expanded ? t("Show fewer") : t("Show all {{count}}", { count: panel.total })}
        </button>
      ) : null}
    </section>
  );
}

/** Approximate visible height of a panel, in row units, for column balancing. */
function panelWeight(panel: DosageCategoryGroup) {
  return Math.min(panel.drugs.length, ROW_CAP) + 2; // header + expand control
}

/**
 * Split the rank-ordered panels into two column stacks at the index that best
 * balances their visible heights. Order is preserved (read down the left
 * column, then the right), and expanding a panel only grows its own column, so
 * nothing jumps across the fold mid-interaction.
 */
function splitPanels(panels: DosageCategoryGroup[]): [DosageCategoryGroup[], DosageCategoryGroup[]] {
  const total = panels.reduce((sum, panel) => sum + panelWeight(panel), 0);
  let best = panels.length;
  let bestImbalance = Number.POSITIVE_INFINITY;
  let left = 0;
  for (let index = 1; index <= panels.length; index += 1) {
    left += panelWeight(panels[index - 1]!);
    const imbalance = Math.abs(left - (total - left));
    if (imbalance < bestImbalance) {
      bestImbalance = imbalance;
      best = index;
    }
  }
  return [panels.slice(0, best), panels.slice(best)];
}

export function StructurePanels({ panels, molecules }: StructurePanelsProps) {
  const structureBySlug = useMemo(
    () => new Map(molecules.map((molecule) => [molecule.slug, molecule.url])),
    [molecules],
  );
  const [leftPanels, rightPanels] = useMemo(() => splitPanels(panels), [panels]);

  if (panels.length === 1) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <StructurePanel panel={panels[0]!} structureBySlug={structureBySlug} />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-x-12 gap-y-10 lg:grid-cols-2">
      {[leftPanels, rightPanels].map((columnPanels, column) => (
        <div key={column} className="flex min-w-0 flex-col gap-y-10">
          {columnPanels.map((panel) => (
            <StructurePanel key={panel.key} panel={panel} structureBySlug={structureBySlug} />
          ))}
        </div>
      ))}
    </div>
  );
}
