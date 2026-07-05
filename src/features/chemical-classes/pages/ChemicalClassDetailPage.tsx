import Link from "next/link";

import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import { CategoryIntro } from "@/components/pages/CategoryIntro";
import { icons } from "@/utils/iconNames";
import { cn } from "@/lib/utils";
import { MoleculeMarquee } from "../components/MoleculeMarquee";
import type { ChemicalClassDetail, ChemicalClassTreeSummary } from "../types";

interface ChemicalClassDetailPageProps {
  detail: ChemicalClassDetail;
}

function Count({ value }: { value: number }) {
  return value > 0 ? <span className="theme-text-faint ml-2 font-normal">· {value}</span> : null;
}

const INDENT_PX = 22;

function LineageRow({
  item,
  depth,
  current = false,
  quiet = false,
}: {
  item: ChemicalClassTreeSummary;
  depth: number;
  current?: boolean;
  quiet?: boolean;
}) {
  const content = (
    <>
      <span>{item.label}</span>
      <Count value={item.rolledTotal} />
    </>
  );

  return (
    <div
      className="flex min-h-8 items-center"
      style={depth > 0 ? { paddingLeft: (depth - 1) * INDENT_PX } : undefined}
    >
      {depth > 0 ? (
        <span
          aria-hidden
          className="border-dose-divider mr-2 h-4 w-3 -translate-y-1 self-center rounded-bl-sm border-b border-l"
        />
      ) : null}
      {current ? (
        <span className="theme-accent-heading text-sm font-semibold leading-6 sm:text-[0.9375rem]">
          {content}
        </span>
      ) : (
        <Link
          href={`/chemical-classes/${item.key}`}
          className={cn(
            "inline-flex items-center rounded-sm text-sm leading-6 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 sm:text-[0.9375rem]",
            quiet ? "theme-text-faint hover:opacity-85" : "theme-text-secondary hover:opacity-85",
          )}
        >
          {content}
        </Link>
      )}
    </div>
  );
}

function LineageBlock({ detail }: { detail: ChemicalClassDetail }) {
  const currentDepth = Math.max(detail.lineage.length - 1, 0);

  return (
    <section aria-label={`${detail.label} lineage`} className="mx-auto mt-8 max-w-3xl sm:mt-10">
      <div className="space-y-1">
        {detail.lineage.map((item, index) => (
          <LineageRow
            key={item.key}
            item={item}
            depth={index}
            current={item.key === detail.key}
          />
        ))}

        {detail.children.length > 0 ? (
          <div className="space-y-1 pt-1">
            {detail.children.map((child) => (
              <LineageRow key={child.key} item={child} depth={currentDepth + 1} />
            ))}
          </div>
        ) : null}

        {detail.siblings.length > 0 ? (
          <div className="mt-4 space-y-1">
            <p
              className="theme-text-faint pb-1 text-xs font-medium uppercase tracking-[0.14em]"
              style={currentDepth > 0 ? { paddingLeft: (currentDepth - 1) * INDENT_PX + 20 } : undefined}
            >
              Same level
            </p>
            {detail.siblings.map((sibling) => (
              <LineageRow key={sibling.key} item={sibling} depth={currentDepth} quiet />
            ))}
          </div>
        ) : null}
      </div>

      {detail.otherParents.length > 0 ? (
        <p className="theme-text-faint mt-4 text-sm leading-6">
          Also classified under:{" "}
          {detail.otherParents.map((parent, index) => (
            <span key={parent.key}>
              {index > 0 ? ", " : null}
              <Link
                href={`/chemical-classes/${parent.key}`}
                className="rounded-sm underline-offset-4 transition-colors hover:opacity-85 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
              >
                {parent.label}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

export function ChemicalClassDetailPage({ detail }: ChemicalClassDetailPageProps) {
  const panels = detail.panels;

  return (
    <PublicContentShell width="wide" focusTarget className="max-w-none 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <PageHeader
          className="sm:mb-8"
          title={detail.label}
          icon={icons.hexagon}
          prominentMobileIcon
          showSpotlight={false}
        />
      </div>

      <LineageBlock detail={detail} />

      <CategoryIntro
        content={detail.description ? { definition: detail.description } : undefined}
        activeTab={detail.key}
      />

      {detail.molecules.length > 0 ? (
        <div className="theme-section-card-enter mt-2 sm:mt-3">
          <MoleculeMarquee
            molecules={detail.molecules}
            featuredCount={detail.featuredCount}
            label={detail.label}
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
        {detail.total === 0 ? (
          <StateCard
            className="mx-auto w-full max-w-xl"
            badge="No substances"
            badgeVariant="secondary"
            title="No published substances in this class yet"
            description={
              detail.children.length > 0
                ? "Explore its subclasses above."
                : "Check back as article coverage grows."
            }
            icon="lucide:hexagon"
            tone="neutral"
          />
        ) : (
          <CategoryGrid groups={panels} drugHrefPrefix="/" maxColumns={3} />
        )}
      </div>
    </PublicContentShell>
  );
}
