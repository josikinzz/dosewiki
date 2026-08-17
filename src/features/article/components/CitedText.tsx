import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import { CITE_TOKEN_PATTERN } from "@/lib/citations/citationTokens";
import { buildCitationNumbering } from "@/lib/citations/referenceModel";
import { cn } from "@/lib/utils";

export type CitationSupProps = Omit<
  ComponentPropsWithoutRef<"sup">,
  "children"
> & {
  citations: CitationLink[];
  linkClassName?: string;
  onCitationClick?: (citation: CitationLink, event: MouseEvent<HTMLAnchorElement>) => void;
};

export type CitationLink = {
  accessibleLabel: string;
  href: string;
  label: string;
  referenceId?: string;
  title?: string;
};

export function CitationSup({
  className,
  citations,
  linkClassName,
  onCitationClick,
  ...props
}: CitationSupProps) {
  return (
    <sup
      className={cn(
        "relative -top-[0.42em] ml-0.5 inline-flex gap-[0.32em] align-baseline text-[0.62em] leading-none",
        className,
      )}
      {...props}
    >
      {citations.map((citation, index) => (
        <a
          key={`${citation.href}-${citation.label}-${index}`}
          href={citation.href}
          data-reference-id={citation.referenceId}
          aria-label={citation.accessibleLabel}
          title={citation.title}
          onClick={onCitationClick ? (event) => onCitationClick(citation, event) : undefined}
          className={cn(
            "theme-citation-marker inline-flex items-center rounded-[0.12rem] px-[0.22em] py-[0.02em] font-medium leading-[1.05] tabular-nums no-underline",
            linkClassName,
          )}
        >
          {citation.label}
        </a>
      ))}
    </sup>
  );
}

function renderCitationSup(citations: CitationLink[], key: string) {
  return <CitationSup key={key} citations={citations} />;
}

/**
 * Unresolvable markers — a `[cite:x]` whose id matches no reference, or one
 * sitting in a field the public render-order walk never numbers — render
 * nothing at all. A reader-facing "?" is editorial laundry on the front end;
 * the broken marker is a *review* finding, and it stays loud on review
 * surfaces (the citation panel's dangling-marker list and the editor's
 * citation diagnostics both report it, and the raw token is visible in every
 * inline-edit textarea). The token text itself is still consumed so it never
 * leaks as literal `[cite:x]`.
 */

export function renderCitedText(text: string, article: SubstanceArticle): ReactNode[] {
  const numbering = buildCitationNumbering(article.references ?? [], article);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const adjacent: CitationLink[] = [];

  const flushAdjacent = () => {
    if (adjacent.length === 0) return;
    nodes.push(renderCitationSup([...adjacent], `cite-${nodes.length}`));
    adjacent.length = 0;
  };

  for (const match of text.matchAll(CITE_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      flushAdjacent();
      nodes.push(text.slice(cursor, index).replace(/\s+$/, ""));
    }
    const number = numbering.numbersById.get(match[1]);
    const reference = number
      ? numbering.numberedReferences.find((item) => item.number === number)
      : undefined;
    if (number && reference) {
      adjacent.push({
        accessibleLabel: `Citation ${number}`,
        href: `#${reference.anchorId}`,
        label: String(number),
        referenceId: match[1],
      });
    }
    cursor = index + match[0].length;
  }

  flushAdjacent();
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function CitedText({ text, article }: { text: string; article: SubstanceArticle }) {
  return <>{renderCitedText(text, article)}</>;
}

export type ArticleTextProps = Omit<
  ComponentPropsWithoutRef<"p">,
  "children"
> & {
  article?: SubstanceArticle;
  as?: "p" | "span" | "div";
  children?: ReactNode;
  cited?: boolean;
  text?: string | null;
  tone?: "body" | "muted" | "faint";
};

const articleTextToneClasses = {
  body: "theme-text-primary",
  muted: "theme-text-secondary",
  faint: "theme-text-faint",
} satisfies Record<NonNullable<ArticleTextProps["tone"]>, string>;

export function ArticleText({
  article,
  as = "p",
  children,
  cited = true,
  className,
  text,
  tone = "body",
  ...props
}: ArticleTextProps) {
  const Component = as;
  const content =
    typeof text === "string"
      ? cited && article
        ? renderCitedText(text, article)
        : text
      : children;

  return (
    <Component
      className={cn(
        "text-sm leading-relaxed",
        articleTextToneClasses[tone],
        className,
      )}
      {...props}
    >
      {content}
    </Component>
  );
}

export function CitationMarker({
  article,
  referenceIds,
}: {
  article: SubstanceArticle;
  referenceIds?: string[] | null;
}) {
  if (!referenceIds || referenceIds.length === 0) {
    return null;
  }

  const numbering = buildCitationNumbering(article.references ?? [], article);
  // Same rule as token rendering: an id that never earned a number is a review
  // finding, not a reader-facing "?" — it simply does not render here.
  const citations = referenceIds.flatMap((referenceId) => {
    const number = numbering.numbersById.get(referenceId);
    const reference = numbering.referencesById.get(referenceId);
    if (!number || !reference) return [];

    return [{
      accessibleLabel: `Citation ${number}`,
      href: `#ref-${reference.id}`,
      label: String(number),
      referenceId,
    }];
  });
  if (citations.length === 0) return null;

  return renderCitationSup(citations, `marker-${referenceIds.join("-")}`);
}
