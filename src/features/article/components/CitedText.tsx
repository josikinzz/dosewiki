import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import { CITE_TOKEN_PATTERN, buildCitationNumbering } from "@/lib/citations/referenceModel";
import { cn } from "@/lib/utils";

export type CitationSupProps = Omit<
  ComponentPropsWithoutRef<"sup">,
  "children"
> & {
  href: string;
  label: string;
  linkClassName?: string;
};

export function CitationSup({
  className,
  href,
  label,
  linkClassName,
  ...props
}: CitationSupProps) {
  return (
    <sup
      className={cn("ml-0.5 align-super text-[0.7em] leading-none", className)}
      {...props}
    >
      <a
        href={href}
        className={cn(
          "theme-evidence-link rounded px-0.5 font-medium tabular-nums no-underline",
          linkClassName,
        )}
      >
        [{label}]
      </a>
    </sup>
  );
}

function renderCitationSup(label: string, href: string, key: string) {
  return <CitationSup key={key} label={label} href={href} />;
}

export function renderCitedText(text: string, article: SubstanceArticle): ReactNode[] {
  const numbering = buildCitationNumbering(article.references ?? [], article);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const adjacent: string[] = [];

  const flushAdjacent = () => {
    if (adjacent.length === 0) return;
    const label = adjacent.join(", ");
    const first = Number(adjacent[0]);
    const reference = numbering.numberedReferences.find((item) => item.number === first);
    nodes.push(renderCitationSup(label, reference ? `#${reference.anchorId}` : "#sources", `cite-${nodes.length}`));
    adjacent.length = 0;
  };

  for (const match of text.matchAll(CITE_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      flushAdjacent();
      nodes.push(text.slice(cursor, index).replace(/\s+$/, ""));
    }
    const number = numbering.numbersById.get(match[1]);
    adjacent.push(number ? String(number) : "?");
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
  const label = referenceIds
    .map((referenceId) => numbering.numbersById.get(referenceId))
    .map((number) => (number ? String(number) : "?"))
    .join(", ");

  const firstResolvedReference = referenceIds
    .map((referenceId) => numbering.referencesById.get(referenceId))
    .find(Boolean);

  return renderCitationSup(label, firstResolvedReference ? `#ref-${firstResolvedReference.id}` : "#sources", `marker-${referenceIds.join("-")}`);
}
