"use client";

import { memo, useEffect, useMemo, useState, type MouseEvent } from "react";
import { ArticleCitationList } from "@/components/common/ArticleCitationList";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
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

type CitationBacklink = {
  href: string;
  label: string;
  occurrenceIndex: number;
  referenceId: string;
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
        group={group}
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

function useReferenceBacklinks(
  citations: readonly ProjectedCitation[],
  fallbackBacklinks: Record<string, CitationBacklink[]>,
) {
  const [referenceBacklinks, setReferenceBacklinks] = useState<Record<string, CitationBacklink[]>>(
    () => cloneBacklinkMap(fallbackBacklinks),
  );

  useEffect(() => {
    const sourceSection = document.getElementById("sources");

    if (citations.length === 0) {
      setReferenceBacklinks(fallbackBacklinks);
      return;
    }

    const updateBacklinks = () => {
      const countsByReferenceId = new Map<string, number>();
      const nextBacklinks = cloneBacklinkMap(fallbackBacklinks);
      const evidenceLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a.theme-citation-marker"),
      ).filter((link) => !sourceSection?.contains(link));

      evidenceLinks.forEach((link, index) => {
        const referenceId = link.dataset.referenceId;
        if (!referenceId) return;

        const markerId = link.id || `cite-use-${index + 1}`;
        link.id = markerId;
        const count = countsByReferenceId.get(referenceId) ?? 0;
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
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [citations, fallbackBacklinks]);

  return referenceBacklinks;
}

function expandCollapsedArticleControls() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]'),
  ).filter((button) => button.getAttribute("aria-label")?.startsWith("Expand "));

  for (const button of buttons) {
    button.click();
  }
}

function scrollToReferenceUse(referenceId: string, occurrenceIndex: number, href: string) {
  const scroll = () => {
    const markers = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        `a.theme-citation-marker[data-reference-id="${CSS.escape(referenceId)}"]`,
      ),
    ).filter((marker) => !document.getElementById("sources")?.contains(marker));
    const target = markers[occurrenceIndex] ?? markers[0] ?? document.querySelector<HTMLElement>(href);

    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    document.querySelector<HTMLElement>("#sources")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  expandCollapsedArticleControls();
  window.requestAnimationFrame(() => window.requestAnimationFrame(scroll));
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

  const handleBacklinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    link: CitationBacklink,
  ) => {
    event.preventDefault();
    scrollToReferenceUse(link.referenceId, link.occurrenceIndex, link.href);
  };

  return (
    <span
      className={cn(
        "theme-citation-marker relative -top-[0.38em] ml-2 inline-flex h-[1.12em] items-center gap-[0.36em] rounded-[0.12rem] px-[0.36em] align-baseline",
        "text-[0.74em] font-semibold leading-none tabular-nums",
      )}
      aria-label={`Uses of citation ${citation.number}`}
    >
      <Icon icon="lucide:arrow-up" size="0.95em" className="shrink-0" />
      {links.map((link) => (
        <a
          key={`${citation.referenceId ?? citation.anchorId}-${link.label}`}
          href={link.href}
          onClick={(event) => handleBacklinkClick(event, link)}
          className={cn(
            "inline-flex h-[1.12em] min-w-[1.12em] items-center justify-center rounded-[0.12rem] px-[0.22em]",
            "text-current transition-colors hover:bg-[color:color-mix(in_srgb,var(--theme-accent-soft)_18%,transparent)]",
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
          "inline-flex h-5 min-w-5 items-center justify-center justify-self-end rounded-[0.12rem] px-1 text-xs font-semibold leading-none tabular-nums",
          "theme-reference-number",
        )}
        aria-hidden="true"
      >
        {citation.number}
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
