"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { ArticleCitationList } from "@/components/common/ArticleCitationList";
import { ArticleSection } from "@/components/common/ArticleSection";
import { cn } from "@/lib/utils";
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
  group: CitationProjectionGroup;
  icon: string;
  key: string;
};

type CitationBacklink = {
  href: string;
  label: string;
};

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
        group={group}
        referenceBacklinks={referenceBacklinks}
      />
    );
  }

  return <ArticleCitationList citations={group.items} truncateLabels={false} />;
}

function parseCitationNumbers(label: string | null | undefined) {
  const marker = label?.match(/\[([^\]]+)\]/)?.[1] ?? "";
  return marker
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((number) => Number.isInteger(number) && number > 0);
}

function areBacklinkMapsEqual(
  left: Record<string, CitationBacklink[]>,
  right: Record<string, CitationBacklink[]>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function useReferenceBacklinks(citations: readonly ProjectedCitation[]) {
  const [referenceBacklinks, setReferenceBacklinks] = useState<Record<string, CitationBacklink[]>>({});

  useEffect(() => {
    const sourceSection = document.getElementById("sources");
    const referenceIdByNumber = new Map<number, string>();

    for (const citation of citations) {
      if (citation.referenceId) {
        referenceIdByNumber.set(citation.number, citation.referenceId);
      }
    }

    if (referenceIdByNumber.size === 0) {
      setReferenceBacklinks({});
      return;
    }

    const updateBacklinks = () => {
      const countsByReferenceId = new Map<string, number>();
      const nextBacklinks: Record<string, CitationBacklink[]> = {};
      const evidenceLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a.theme-evidence-link"),
      ).filter((link) => !sourceSection?.contains(link));

      evidenceLinks.forEach((link, index) => {
        const referenceIds = parseCitationNumbers(link.textContent)
          .map((number) => referenceIdByNumber.get(number))
          .filter((referenceId): referenceId is string => !!referenceId);

        if (referenceIds.length === 0) return;

        const markerId = link.id || `cite-use-${index + 1}`;
        link.id = markerId;

        for (const referenceId of referenceIds) {
          const count = (countsByReferenceId.get(referenceId) ?? 0) + 1;
          countsByReferenceId.set(referenceId, count);
          nextBacklinks[referenceId] ??= [];
          nextBacklinks[referenceId].push({
            href: `#${markerId}`,
            label: String(count),
          });
        }
      });

      setReferenceBacklinks((previous) => (
        areBacklinkMapsEqual(previous, nextBacklinks) ? previous : nextBacklinks
      ));
    };

    updateBacklinks();

    const observer = new MutationObserver(updateBacklinks);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [citations]);

  return referenceBacklinks;
}

function ReferenceLabel({ label }: { label: string }) {
  const linkMatch = label.match(/(https?:\/\/\S+)$/);

  if (!linkMatch?.index) {
    return <>{label}</>;
  }

  const text = label.slice(0, linkMatch.index).trimEnd();
  const url = linkMatch[0];

  return (
    <>
      {text}{" "}
      <span
        className={cn(
          "font-medium text-[color:var(--theme-accent-strong)] underline decoration-[color:color-mix(in_srgb,var(--theme-accent)_36%,transparent)] underline-offset-[0.18em]",
          "transition-colors group-hover:text-[color:var(--theme-accent)] group-hover:decoration-[color:color-mix(in_srgb,var(--theme-accent)_62%,transparent)]",
        )}
      >
        {url}
      </span>
    </>
  );
}

function CitationUseBacklinks({
  citation,
  links,
}: {
  citation: ProjectedCitation;
  links?: CitationBacklink[];
}) {
  if (!links || links.length === 0) return null;

  return (
    <span
      className="ml-2 inline-flex translate-y-[-0.08em] items-center gap-1 align-baseline"
      aria-label={`Uses of citation ${citation.number}`}
    >
      {links.map((link) => (
        <a
          key={`${citation.referenceId ?? citation.anchorId}-${link.label}`}
          href={link.href}
          className={cn(
            "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1",
            "text-[0.62rem] font-semibold leading-none tabular-nums",
            "bg-[color:color-mix(in_srgb,var(--theme-accent)_10%,transparent)] text-[color:var(--theme-accent-strong)] ring-1 ring-[color:color-mix(in_srgb,var(--theme-accent)_24%,transparent)]",
            "transition hover:bg-[color:color-mix(in_srgb,var(--theme-accent)_16%,transparent)] hover:text-[color:var(--theme-accent)] hover:ring-[color:color-mix(in_srgb,var(--theme-accent)_38%,transparent)]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400",
          )}
          aria-label={`Go to use ${link.label} of citation ${citation.number}`}
        >
          {link.label}
        </a>
      ))}
    </span>
  );
}

function ReferenceListItem({
  citation,
  backlinks,
}: {
  citation: ProjectedCitation;
  backlinks?: CitationBacklink[];
}) {
  const content = (
    <span className="theme-reference-label hyphenate transition-colors">
      <ReferenceLabel label={citation.label} />
    </span>
  );

  return (
    <li
      id={citation.anchorId}
      className={cn(
        "group grid max-w-full scroll-mt-20 grid-cols-[2.25rem_minmax(0,1fr)] gap-3",
        "text-sm leading-relaxed sm:text-[0.9375rem]",
      )}
    >
      <span
        className={cn(
          "pt-[0.15rem] text-right font-medium tabular-nums",
          "theme-reference-number",
        )}
        aria-hidden="true"
      >
        [{citation.number}]
      </span>
      <span className="hyphenate min-w-0 max-w-full sm:max-w-[78ch]">
        {citation.url ? (
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "theme-reference-link hyphenate underline underline-offset-[0.18em]",
              "transition-colors focus-visible:outline-none",
            )}
          >
            {content}
          </a>
        ) : (
          content
        )}
        <CitationUseBacklinks citation={citation} links={backlinks} />
      </span>
    </li>
  );
}

function ReferenceCitationList({
  group,
  referenceBacklinks,
}: {
  group: CitationProjectionGroup;
  referenceBacklinks?: Record<string, CitationBacklink[]>;
}) {
  return (
    <ol className="max-w-full list-none space-y-3.5 p-0">
      {group.items.map((citation) => (
        <ReferenceListItem
          key={`${citation.anchorId}-${citation.referenceId ?? citation.url}`}
          citation={citation}
          backlinks={citation.referenceId ? referenceBacklinks?.[citation.referenceId] : undefined}
        />
      ))}
    </ol>
  );
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
  const referenceBacklinks = useReferenceBacklinks(references.items);

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
