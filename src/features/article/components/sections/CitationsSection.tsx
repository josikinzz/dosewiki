"use client";

import { memo } from "react";
import { ArticleCitationList } from "@/components/common/ArticleCitationList";
import { ExpandableList } from "@/components/common/ArticleExpandable";
import { ArticleSection } from "@/components/common/ArticleSection";
import type { SubstanceArticle } from "@/schema";
import {
  projectSubstanceCitations,
  type CitationProjectionGroup,
  type ProjectedCitation,
} from "@/lib/citationProjection";

interface CitationsSectionProps {
  article: SubstanceArticle;
}

type CitationGroupConfig = {
  ariaLabelBase: string;
  group: CitationProjectionGroup;
  icon: string;
  key: string;
};

function CitationGroupContent({
  ariaLabelBase,
  group,
}: {
  ariaLabelBase: string;
  group: CitationProjectionGroup;
}) {
  return (
    <ExpandableList<ProjectedCitation>
      ariaLabelBase={ariaLabelBase}
      collapsedCount={group.collapsedCount}
      hasCollapsedItems={group.hasCollapsedItems}
      items={group.items}
      visibleItems={group.visibleItems}
    >
      {({ items }) => <ArticleCitationList citations={items} />}
    </ExpandableList>
  );
}

export const CitationsSection = memo(function CitationsSection({
  article,
}: CitationsSectionProps) {
  const projection = projectSubstanceCitations({
    article,
    references: article.references,
    sourceCitations: article.source_citations,
    citations: article.citations,
  });
  const { references, primarySources, furtherReading } = projection;

  if (projection.isEmpty) {
    return null;
  }

  const groups: CitationGroupConfig[] = [
    {
      ariaLabelBase: "references",
      group: references,
      icon: "lucide:list-ordered",
      key: "references",
    },
    {
      ariaLabelBase: "source pages",
      group: primarySources,
      icon: "lucide:library",
      key: "primary-sources",
    },
    {
      ariaLabelBase: "further reading",
      group: furtherReading,
      icon: "lucide:book-open",
      key: "further-reading",
    },
  ].filter(({ group }) => group.items.length > 0);

  const [firstGroup, ...remainingGroups] = groups;

  if (!firstGroup) {
    return null;
  }

  return (
    <ArticleSection
      id="sources"
      icon={firstGroup.icon}
      heading={firstGroup.group.title}
      className="theme-article-priority-section space-y-8 rounded-2xl px-4 pb-5"
      headerClassName="theme-evidence-priority-heading"
    >
      <CitationGroupContent
        ariaLabelBase={firstGroup.ariaLabelBase}
        group={firstGroup.group}
      />

      {remainingGroups.map(({ ariaLabelBase, group, icon, key }) => (
        <ArticleSection.Group
          key={key}
          icon={icon}
          heading={group.title}
          className="pt-12"
          spacing="loose"
        >
          <CitationGroupContent
            ariaLabelBase={ariaLabelBase}
            group={group}
          />
        </ArticleSection.Group>
      ))}
    </ArticleSection>
  );
});
