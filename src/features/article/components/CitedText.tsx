import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import { CITE_TOKEN_PATTERN, buildCitationNumbering } from "@/lib/citations/referenceModel";
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

function getCitationAccessibleLabel(number: number | undefined, referenceId: string) {
  return number
    ? `Citation ${number}`
    : `Citation for unresolved reference ${referenceId}`;
}

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
    adjacent.push({
      accessibleLabel: getCitationAccessibleLabel(number, match[1]),
      href: reference ? `#${reference.anchorId}` : "#sources",
      label: number ? String(number) : "?",
      referenceId: match[1],
    });
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
  const citations = referenceIds.map((referenceId) => {
    const number = numbering.numbersById.get(referenceId);
    const reference = numbering.referencesById.get(referenceId);

    return {
      accessibleLabel: getCitationAccessibleLabel(number, referenceId),
      href: reference ? `#ref-${reference.id}` : "#sources",
      label: number ? String(number) : "?",
      referenceId,
    };
  });

  return renderCitationSup(citations, `marker-${referenceIds.join("-")}`);
}
