"use client";

import { useEffect, useState } from "react";
import { ArticleCitationList } from "@/components/common/ArticleCitationList";
import { ArticleSection } from "@/components/common/ArticleSection";
import {
  ReferenceCitationList,
  type CitationBacklink,
} from "@/components/common/ReferenceList";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { useT } from "@/i18n/client";
import { msg } from "@/i18n/messages";
import type {
  CitationProjection,
  CitationProjectionGroup,
} from "@/lib/citationProjection";

type CitationGroupConfig = {
  group: CitationProjectionGroup;
  icon: string;
  key: string;
};

export interface CitationsSectionViewProps {
  projection: CitationProjection;
  initialBacklinks: Record<string, CitationBacklink[]>;
}

function CitationGroupContent({
  group,
  referenceBacklinks,
}: {
  group: CitationProjectionGroup;
  referenceBacklinks?: Record<string, CitationBacklink[]>;
}) {
  if (group.role === "reference") {
    return (
      <ReferenceCitationList
        citations={group.items}
        referenceBacklinks={referenceBacklinks}
      />
    );
  }

  return <ArticleCitationList citations={group.items} truncateLabels={false} />;
}

function cloneBacklinkMap(backlinks: Record<string, CitationBacklink[]>) {
  return Object.fromEntries(
    Object.entries(backlinks).map(([referenceId, links]) => [
      referenceId,
      links.map((link) => ({ ...link })),
    ]),
  );
}

function areBacklinkMapsEqual(
  left: Record<string, CitationBacklink[]>,
  right: Record<string, CitationBacklink[]>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((referenceId) => {
    const leftLinks = left[referenceId];
    const rightLinks = right[referenceId];
    return (
      rightLinks &&
      leftLinks.length === rightLinks.length &&
      leftLinks.every((link, index) => {
        const other = rightLinks[index];
        return (
          link.href === other.href &&
          link.label === other.label &&
          link.occurrenceIndex === other.occurrenceIndex &&
          link.referenceId === other.referenceId
        );
      })
    );
  });
}

function getCitationBacklinkRoot(sourceSection: HTMLElement | null) {
  return (
    sourceSection?.closest("main") ??
    document.getElementById("main-content") ??
    sourceSection?.parentElement ??
    null
  );
}

function getCitationUseId(referenceId: string, occurrenceIndex: number) {
  const stableReferenceId = referenceId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `cite-use-${stableReferenceId || "reference"}-${occurrenceIndex + 1}`;
}

function containsCitationMarker(node: Node) {
  return (
    node instanceof Element &&
    (node.matches("a.theme-citation-marker[data-reference-id]") ||
      node.querySelector("a.theme-citation-marker[data-reference-id]"))
  );
}

function useReferenceBacklinks(
  hasReferences: boolean,
  initialBacklinks: Record<string, CitationBacklink[]>,
) {
  const [referenceBacklinks, setReferenceBacklinks] =
    useState(initialBacklinks);

  useEffect(() => {
    const sourceSection = document.getElementById("sources");
    const backlinkRoot = getCitationBacklinkRoot(sourceSection);
    if (!hasReferences || !backlinkRoot) return;

    let frameId: number | null = null;
    const updateBacklinks = () => {
      frameId = null;
      const countsByReferenceId = new Map<string, number>();
      const nextBacklinks = cloneBacklinkMap(initialBacklinks);
      const evidenceLinks = backlinkRoot.querySelectorAll<HTMLAnchorElement>(
        "a.theme-citation-marker[data-reference-id]",
      );

      evidenceLinks.forEach((link) => {
        if (sourceSection?.contains(link)) return;
        const referenceId = link.dataset.referenceId;
        if (!referenceId) return;

        const count = countsByReferenceId.get(referenceId) ?? 0;
        const markerId = link.id || getCitationUseId(referenceId, count);
        if (!link.id) link.id = markerId;
        countsByReferenceId.set(referenceId, count + 1);

        const candidate = nextBacklinks[referenceId]?.[count];
        if (candidate) candidate.href = `#${markerId}`;
      });

      setReferenceBacklinks((previous) =>
        areBacklinkMapsEqual(previous, nextBacklinks)
          ? previous
          : nextBacklinks,
      );
    };
    const scheduleUpdate = () => {
      if (frameId === null)
        frameId = window.requestAnimationFrame(updateBacklinks);
    };

    updateBacklinks();
    const observer = new MutationObserver((records) => {
      const citationChanged = records.some((record) => {
        if (sourceSection?.contains(record.target)) return false;
        return [...record.addedNodes, ...record.removedNodes].some(
          containsCitationMarker,
        );
      });
      if (citationChanged) scheduleUpdate();
    });
    observer.observe(backlinkRoot, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [hasReferences, initialBacklinks]);

  return referenceBacklinks;
}

export function CitationsSectionView({
  projection,
  initialBacklinks,
}: CitationsSectionViewProps) {
  const t = useT();
  const { references, primarySources, furtherReading } = projection;
  const referenceBacklinks = useReferenceBacklinks(
    references.items.length > 0,
    initialBacklinks,
  );

  const groups: CitationGroupConfig[] = [
    { group: primarySources, icon: "lucide:library", key: "primary-sources" },
    {
      group: { ...references, title: msg("Citations") },
      icon: "codicon:references",
      key: "references",
    },
    { group: furtherReading, icon: "lucide:book-open", key: "further-reading" },
  ].filter(({ group }) => group.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <ArticleSection
      id="sources"
      icon={SUBSTANCE_SECTION_ICONS.sources}
      heading={t("References")}
    >
      {groups.map(({ group, icon, key }) => (
        <ArticleSection.Group
          key={key}
          icon={icon}
          heading={t(group.title)}
          className={key === "primary-sources" ? undefined : "pt-12"}
          spacing="loose"
        >
          <CitationGroupContent
            group={group}
            referenceBacklinks={referenceBacklinks}
          />
        </ArticleSection.Group>
      ))}
    </ArticleSection>
  );
}
