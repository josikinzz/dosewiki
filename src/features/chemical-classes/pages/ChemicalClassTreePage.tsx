"use client";

import { useEffect, useMemo } from "react";
import { SmartLink } from "@/components/common/SmartLink";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";

import { Icon } from "@/components/common/Icon";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { StateCard } from "@/components/common/StateCard";
import { icons } from "@/utils/iconNames";
import { cn } from "@/lib/utils";
import type { ChemicalClassTreeNode, ChemicalClassTreePayload } from "../types";

const CHEMICAL_CLASS_INDEX_ICON = icons.hexagon;

interface ChemicalClassTreePageProps {
  payload: ChemicalClassTreePayload;
}

function countSuffix(count: number) {
  return count > 0 ? <span className="theme-text-faint ml-2 font-normal">· {count}</span> : null;
}

function TreeLink({
  node,
  isRoot = false,
  crossReference = false,
}: {
  node: ChemicalClassTreeNode;
  isRoot?: boolean;
  crossReference?: boolean;
}) {
  const t = useT();

  return (
    <div className="flex min-h-8 items-center">
      <SmartLink
        href={`/chemical-classes/${node.key}`}
        className={cn(
          "theme-focus-ring inline-flex items-center rounded-sm leading-6 transition-colors hover:opacity-85",
          isRoot ? "text-base font-semibold sm:text-lg" : "text-sm sm:text-[0.9375rem]",
          crossReference ? "theme-text-faint" : "theme-accent-heading",
        )}
      >
        <span>{t(node.label)}</span>
        {countSuffix(node.rolledTotal)}
        {crossReference ? (
          <Icon icon={icons.arrowRight} className="theme-text-faint ml-1.5 h-3.5 w-3.5" />
        ) : null}
      </SmartLink>
    </div>
  );
}

function TreeNode({
  nodeKey,
  payload,
  depth,
  renderedAsPrimary,
}: {
  nodeKey: string;
  payload: ChemicalClassTreePayload;
  depth: number;
  renderedAsPrimary: Set<string>;
}) {
  const node = payload.nodes[nodeKey];
  if (!node) return null;

  const primaryParent = node.parents[0];
  const isPrimaryPlacement = depth === 0 || !primaryParent || renderedAsPrimary.has(primaryParent);
  const nextRenderedAsPrimary = new Set(renderedAsPrimary);
  if (isPrimaryPlacement) nextRenderedAsPrimary.add(node.key);

  return (
    <li>
      <TreeLink node={node} isRoot={depth === 0} crossReference={!isPrimaryPlacement} />
      {isPrimaryPlacement && node.children.length > 0 ? (
        <ul className="border-dose-divider ml-[3px] mt-1 space-y-1 border-l pl-4 sm:pl-5">
          {node.children.map((childKey) => (
            <TreeNode
              key={childKey}
              nodeKey={childKey}
              payload={payload}
              depth={depth + 1}
              renderedAsPrimary={nextRenderedAsPrimary}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ChemicalClassTreePage({ payload }: ChemicalClassTreePageProps) {
  const router = useRouter();
  const t = useT();


  useEffect(() => {
    const key = window.location.hash.slice(1);
    if (key && payload.nodes[key]) {
      router.replace(`/chemical-classes/${key}`);
    }
  }, [payload.nodes, router]);

  // Large families read as full outlines; single-node roots follow as a
  // tighter run of rows below them, still part of the same tree.
  const { branchingRoots, leafRoots } = useMemo(() => {
    const sorted = [...payload.roots].sort(
      (a, b) => (payload.nodes[b]?.rolledTotal ?? 0) - (payload.nodes[a]?.rolledTotal ?? 0),
    );
    return {
      branchingRoots: sorted.filter((key) => (payload.nodes[key]?.children.length ?? 0) > 0),
      leafRoots: sorted.filter((key) => (payload.nodes[key]?.children.length ?? 0) === 0),
    };
  }, [payload]);

  return (
    <PublicContentShell width="wide" focusTarget className="max-w-none 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <PageHeader
          className="sm:mb-8"
          title={t("Chemical Class Index")}
          icon={CHEMICAL_CLASS_INDEX_ICON}
        />
        {/* Credit line under the title, mirroring the Subjective Effect
            Index's "created by Josie Kins, 2011": the class taxonomy is
            adapted from AnodyneWiki's chemical class tree. */}
        <div className="relative z-10 -mt-12 mb-12 flex flex-col items-center gap-2 sm:-mt-4">
          <a
            href="https://anodyne.wiki/"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 py-1 transition-colors"
          >
            <span className="theme-text-faint text-xs transition group-hover:text-dose-text-secondary">
              {t("class taxonomy adapted from")}{" "}
              <span className="theme-text-secondary font-semibold underline decoration-dose-divider decoration-1 underline-offset-[3px] transition group-hover:text-dose-accent group-hover:decoration-dose-accent">
                0xea / AnodyneWiki
              </span>
            </span>
          </a>
        </div>
      </div>

      {payload.roots.length === 0 ? (
        <StateCard
          badge={t("No classes")}
          badgeVariant="secondary"
          title={t("No chemical classes found")}
          description={t("No curated chemical classes have been published yet.")}
          icon="lucide:hexagon"
          tone="neutral"
        />
      ) : (
        <nav aria-label={t("Chemical class tree")} className="mx-auto mt-8 max-w-2xl sm:mt-10">
          <p className="theme-text-secondary mb-8 text-sm leading-6 sm:mb-10">
            {t(
              "Every class organized by structural lineage, from broad scaffolds down to specific families. A dimmed entry with an arrow belongs to more than one branch, and its full subtree lives under its primary parent.",
            )}
          </p>

          <div className="space-y-10">
            {branchingRoots.map((rootKey) => (
              <ul key={rootKey} className="space-y-1">
                <TreeNode
                  nodeKey={rootKey}
                  payload={payload}
                  depth={0}
                  renderedAsPrimary={new Set()}
                />
              </ul>
            ))}
          </div>

          {leafRoots.length > 0 ? (
            <ul className="mt-10 space-y-1">
              {leafRoots.map((rootKey) => {
                const node = payload.nodes[rootKey];
                if (!node) return null;
                return (
                  <li key={rootKey}>
                    <TreeLink node={node} isRoot />
                  </li>
                );
              })}
            </ul>
          ) : null}
        </nav>
      )}
    </PublicContentShell>
  );
}
