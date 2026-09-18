import Link from "next/link";
import { SmartLink } from "@/components/common/SmartLink";
import { t } from "@/i18n/server";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { CategoryIntro } from "@/components/pages/CategoryIntro";
import { icons } from "@/utils/iconNames";
import { cn } from "@/lib/utils";
import { MoleculeImage } from "@/components/pages/MoleculeImage";
import { StructurePanels } from "../components/StructurePanels";
import type { ChemicalClassDetail, ChemicalClassTreeSummary } from "../types";

interface ChemicalClassDetailPageProps {
  detail: ChemicalClassDetail;
}

const INDENT_PX = 22;

function Count({ value }: { value: number }) {
  return value > 0 ? <span className="theme-text-faint ml-2 font-normal">· {value}</span> : null;
}

/**
 * One row in the class lineage stack. `depth` 0 is the root scaffold; each step
 * down indents by one connector. `tone` selects how the row reads: the active
 * class is accented and bold; its ancestors and subclasses are quiet links;
 * bioisosteres are the faintest, since they are a lateral aside.
 */
function LineageRow({
  item,
  depth,
  tone,
}: {
  item: ChemicalClassTreeSummary;
  depth: number;
  tone: "ancestor" | "current" | "child" | "bioisostere";
}) {
  const content = (
    <>
      <span>{t(item.label)}</span>
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
      {tone === "current" ? (
        <span className="theme-accent-heading text-sm font-semibold leading-6 sm:text-[0.9375rem]">
          {content}
        </span>
      ) : (
        <SmartLink
          href={`/chemical-classes/${item.key}`}
          className={cn(
            "theme-focus-ring inline-flex items-center rounded-sm text-sm leading-6 transition-colors hover:opacity-85 sm:text-[0.9375rem]",
            tone === "bioisostere" ? "theme-text-faint" : "theme-text-secondary",
          )}
        >
          {content}
        </SmartLink>
      )}
    </div>
  );
}

/**
 * The lineage stack. Ancestors descend root-first; at the active class's own
 * indent its curated bioisosteres sit collapsed just above it, then the active
 * class (accented), then its subclasses expanded beneath. Lateral browsing to
 * unrelated siblings happens by walking back up the ancestor chain.
 */
function LineageStack({ detail }: { detail: ChemicalClassDetail }) {
  const ancestors = detail.lineage.slice(0, -1);
  const currentDepth = Math.max(detail.lineage.length - 1, 0);
  const current: ChemicalClassTreeSummary = detail.lineage[currentDepth] ?? {
    key: detail.key,
    label: detail.label,
    rolledTotal: detail.total,
  };

  return (
    <nav
      aria-label={t("{{className}} lineage", { className: t(detail.label) })}
      className="space-y-1"
    >
      {ancestors.map((item, index) => (
        <LineageRow key={item.key} item={item} depth={index} tone="ancestor" />
      ))}

      {detail.bioisosteres.map((item) => (
        <LineageRow key={item.key} item={item} depth={currentDepth} tone="bioisostere" />
      ))}

      <LineageRow item={current} depth={currentDepth} tone="current" />

      {detail.children.map((child) => (
        <LineageRow key={child.key} item={child} depth={currentDepth + 1} tone="child" />
      ))}
    </nav>
  );
}

function LineageBlock({ detail }: { detail: ChemicalClassDetail }) {
  return (
    <section
      aria-label={t("{{className}} classification", { className: t(detail.label) })}
      className="mx-auto mt-8 max-w-4xl sm:mt-10"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
        <div className="min-w-0 flex-1">
          <LineageStack detail={detail} />

          {detail.otherParents.length > 0 ? (
            <p className="theme-text-faint mt-4 text-sm leading-6">
              {t("Also classified under:")}{" "}
              {detail.otherParents.map((parent, index) => (
                <span key={parent.key}>
                  {index > 0 ? ", " : null}
                  <SmartLink
                    href={`/chemical-classes/${parent.key}`}
                    className="theme-focus-ring rounded-sm underline-offset-4 transition-colors hover:opacity-85 hover:underline"
                  >
                    {t(parent.label)}
                  </SmartLink>
                </span>
              ))}
            </p>
          ) : null}
        </div>

        {detail.structureUrl ? (
          <figure className="shrink-0 self-center sm:self-start">
            <MoleculeImage
              src={detail.structureUrl}
              priority
              alt={t("Generic {{className}} structure with variable R-group positions", {
                className: t(detail.label),
              })}
              width={240}
              height={160}
              className="theme-molecule-image mx-auto h-32 w-auto max-w-[15rem] object-contain sm:h-36"
            />
            <figcaption className="theme-text-faint mt-2 text-center text-xs">
              {t("Generic structure")}
            </figcaption>
          </figure>
        ) : null}
      </div>
    </section>
  );
}

export function ChemicalClassDetailPage({ detail }: ChemicalClassDetailPageProps) {
  const panels = detail.panels;

  return (
    <PublicContentShell width="wide" focusTarget className="max-w-none 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <Button variant="ghostPill" size="pill" asChild className="mb-6">
          <Link href="/chemical-classes">
            <Icon icon={icons.arrowLeft} size={16} />
            {t("Back to Class Tree")}
          </Link>
        </Button>

        <PageHeader
          className="sm:mb-8"
          title={t(detail.label)}
          icon={icons.hexagon}
        />
      </div>

      <LineageBlock detail={detail} />

      <CategoryIntro
        content={detail.description ? { definition: t(detail.description) } : undefined}
        activeTab={detail.key}
      />

      <div className="mt-8 sm:mt-12">
        {detail.total === 0 ? (
          <StateCard
            className="mx-auto w-full max-w-xl"
            badge={t("No substances")}
            badgeVariant="secondary"
            title={t("No published substances in this class yet")}
            description={
              detail.children.length > 0
                ? t("Explore its subclasses above.")
                : t("Check back as article coverage grows.")
            }
            icon="lucide:hexagon"
            tone="neutral"
          />
        ) : (
          <StructurePanels panels={panels} molecules={detail.molecules} />
        )}
      </div>
    </PublicContentShell>
  );
}
