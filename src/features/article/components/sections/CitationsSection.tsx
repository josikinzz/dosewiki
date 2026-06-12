"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { ArticleCitationList } from "@/components/common/ArticleCitationList";
import { ArticleSection } from "@/components/common/ArticleSection";
import {
  ReferenceCitationList,
  type CitationBacklink,
} from "@/components/common/ReferenceList";
import type { SubstanceArticle } from "@/schema";
import { CITE_TOKEN_PATTERN } from "@/lib/citations/referenceModel";
import {
  projectSubstanceCitations,
  type CitationProjectionGroup,
  type ProjectedCitation,
} from "@/lib/citationProjection";

interface CitationsSectionProps {
  article: SubstanceArticle;
}

type CitationGroupConfig = {
  group: CitationProjectionGroup;
  icon: string;
  key: string;
};

function collectArticleReferenceUses(article: SubstanceArticle) {
  const uses: Record<string, CitationBacklink[]> = {};
  const countsByReferenceId = new Map<string, number>();

  const addUse = (referenceId: string, href = "#sources") => {
    if (!referenceId.trim()) return;
    const count = (countsByReferenceId.get(referenceId) ?? 0) + 1;
    countsByReferenceId.set(referenceId, count);
    uses[referenceId] ??= [];
    uses[referenceId].push({
      href,
      label: String(count),
      occurrenceIndex: count - 1,
      referenceId,
    });
  };

  const visit = (value: unknown, seen: WeakSet<object>) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(CITE_TOKEN_PATTERN)) {
        addUse(match[1]);
      }
      return;
    }

    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, seen);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "references" || key === "citations" || key === "source_citations" || key === "editorial_review") {
        continue;
      }
      if (key === "reference_ids" && Array.isArray(child)) {
        child.forEach((referenceId) => {
          if (typeof referenceId === "string") addUse(referenceId);
        });
        continue;
      }
      visit(child, seen);
    }
  };

  visit(article, new WeakSet());
  return uses;
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

function areBacklinkMapsEqual(
  left: Record<string, CitationBacklink[]>,
  right: Record<string, CitationBacklink[]>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneBacklinkMap(backlinks: Record<string, CitationBacklink[]>) {
  return Object.fromEntries(
    Object.entries(backlinks).map(([referenceId, links]) => [
      referenceId,
      links.map((link) => ({ ...link })),
    ]),
  );
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

function useReferenceBacklinks(
  citations: readonly ProjectedCitation[],
  fallbackBacklinks: Record<string, CitationBacklink[]>,
) {
  const [referenceBacklinks, setReferenceBacklinks] = useState<Record<string, CitationBacklink[]>>(
    () => cloneBacklinkMap(fallbackBacklinks),
  );

  useEffect(() => {
    const sourceSection = document.getElementById("sources");
    const backlinkRoot = getCitationBacklinkRoot(sourceSection);

    if (citations.length === 0 || !backlinkRoot) {
      setReferenceBacklinks(fallbackBacklinks);
      return;
    }

    const updateBacklinks = () => {
      const countsByReferenceId = new Map<string, number>();
      const nextBacklinks = cloneBacklinkMap(fallbackBacklinks);
      const evidenceLinks = Array.from(
        backlinkRoot.querySelectorAll<HTMLAnchorElement>("a.theme-citation-marker"),
      ).filter((link) => !sourceSection?.contains(link));

      evidenceLinks.forEach((link) => {
        const referenceId = link.dataset.referenceId;
        if (!referenceId) return;

        const count = countsByReferenceId.get(referenceId) ?? 0;
        const markerId = link.id || getCitationUseId(referenceId, count);
        link.id = markerId;
        countsByReferenceId.set(referenceId, count + 1);

        const candidate = nextBacklinks[referenceId]?.[count];
        if (candidate) {
          candidate.href = `#${markerId}`;
        }
      });

      setReferenceBacklinks((previous) => (
        areBacklinkMapsEqual(previous, nextBacklinks) ? previous : nextBacklinks
      ));
    };

    updateBacklinks();

    const observer = new MutationObserver(updateBacklinks);
    observer.observe(backlinkRoot, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [citations, fallbackBacklinks]);

  return referenceBacklinks;
}

export const CitationsSection = memo(function CitationsSection({
  article,
}: CitationsSectionProps) {
  const projection = useMemo(
    () => projectSubstanceCitations({
      article,
      references: article.references,
      sourceCitations: article.source_citations,
      citations: article.citations,
    }),
    [article],
  );
  const { references, primarySources, furtherReading } = projection;
  const fallbackBacklinks = useMemo(() => collectArticleReferenceUses(article), [article]);
  const referenceBacklinks = useReferenceBacklinks(references.items, fallbackBacklinks);

  if (projection.isEmpty) {
    return null;
  }

  const groups: CitationGroupConfig[] = [
    {
      group: primarySources,
      icon: "lucide:library",
      key: "primary-sources",
    },
    {
      group: {
        ...references,
        title: "Citations",
      },
      icon: "codicon:references",
      key: "references",
    },
    {
      group: furtherReading,
      icon: "lucide:book-open",
      key: "further-reading",
    },
  ].filter(({ group }) => group.items.length > 0);

  if (groups.length === 0) {
    return null;
  }

  return (
    <ArticleSection
      id="sources"
      icon="lucide:list-ordered"
      heading="References"
    >
      {groups.map(({ group, icon, key }) => (
        <ArticleSection.Group
          key={key}
          icon={icon}
          heading={group.title}
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
});
