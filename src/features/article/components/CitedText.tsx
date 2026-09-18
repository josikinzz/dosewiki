import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import { msg } from "@/i18n/messages";
import { CITATION_MARKER_PATTERN } from "@/lib/citations/citationTokens";
import { getArticleCitationModel } from "@/lib/citations/referenceModel";
import { cn } from "@/lib/utils";
import { CitationNeededMarker, CitationSup, type CitationLink } from "./CitationMarks";

export { CitationNeededMarker, CitationSup } from "./CitationMarks";
export type { CitationLink } from "./CitationMarks";

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

type InlineCitationToken = {
  /** Raw text between the previous token (or the text start) and this one. */
  gap: string;
  kind: "cite" | "needed";
  /** Zero-based position among markers of this kind in the raw scanned text. */
  ordinal: number;
  /** Resolved target for a numbered `[cite:<id>]`; undefined when dangling. */
  link?: CitationLink;
  /** Whether a `[citation-needed]` token survives the suppression pass. */
  visible?: boolean;
};

export function renderCitedText(text: string, article: SubstanceArticle): ReactNode[] {
  const numbering = getArticleCitationModel(article);
  const tokens: InlineCitationToken[] = [];
  let cursor = 0;
  let citeOrdinal = 0;
  let neededOrdinal = 0;

  for (const match of text.matchAll(CITATION_MARKER_PATTERN)) {
    const index = match.index ?? 0;
    const gap = text.slice(cursor, index);
    if (match[1] === undefined) {
      tokens.push({ gap, kind: "needed", ordinal: neededOrdinal++ });
    } else {
      const number = numbering.numbersById.get(match[1]);
      const reference = numbering.numberedReferencesById.get(match[1]);
      tokens.push({
        gap,
        kind: "cite",
        ordinal: citeOrdinal,
        link:
          number && reference
            ? {
                accessibleLabel: msg("Citation {{number}}"),
                href: `#${reference.anchorId}`,
                label: String(number),
                markerOrdinal: citeOrdinal,
                referenceId: match[1],
              }
            : undefined,
      });
      citeOrdinal += 1;
    }
    cursor = index + match[0].length;
  }

  // Suppression pass. Tokens separated by nothing or bare whitespace share a
  // cluster around one claim:
  //  - a claim that already carries a resolved citation never shows a
  //    citation-needed marker — the good citation wins;
  //  - consecutive citation-needed flags collapse to one until a resolved
  //    citation intervenes, so an uncited run reads as one flag, not a wall.
  const clusterIds: number[] = [];
  const clustersWithResolvedCite = new Set<number>();
  let clusterId = -1;
  tokens.forEach((token, index) => {
    if (index === 0 || token.gap.trim() !== "") clusterId += 1;
    clusterIds.push(clusterId);
    if (token.kind === "cite" && token.link) clustersWithResolvedCite.add(clusterId);
  });

  let flaggedSinceResolvedCite = false;
  tokens.forEach((token, index) => {
    if (token.kind === "cite") {
      if (token.link) flaggedSinceResolvedCite = false;
      return;
    }
    token.visible =
      !clustersWithResolvedCite.has(clusterIds[index]) && !flaggedSinceResolvedCite;
    if (token.visible) flaggedSinceResolvedCite = true;
  });

  const nodes: ReactNode[] = [];
  const adjacent: CitationLink[] = [];
  let pending = "";

  const flushAdjacent = () => {
    if (adjacent.length === 0) return;
    nodes.push(renderCitationSup([...adjacent], `cite-${nodes.length}`));
    adjacent.length = 0;
  };

  const flushPending = () => {
    if (pending === "") return;
    flushAdjacent();
    nodes.push(pending.replace(/\s+$/, ""));
    pending = "";
  };

  for (const token of tokens) {
    if (token.kind === "cite") {
      pending += token.gap;
      flushPending();
      if (token.link) adjacent.push(token.link);
      continue;
    }
    if (!token.visible) {
      // Suppressed marker: consume the token, keep its leading text, and drop
      // the whitespace that separated it from its claim.
      pending += token.gap.replace(/\s+$/, "");
      continue;
    }
    pending += token.gap;
    flushPending();
    flushAdjacent();
    nodes.push(
      <CitationNeededMarker
        key={`citation-needed-${nodes.length}`}
        markerOrdinal={token.ordinal}
      />,
    );
  }

  pending += text.slice(cursor);
  flushAdjacent();
  if (pending !== "") nodes.push(pending);
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

  const numbering = getArticleCitationModel(article);
  // Same rule as token rendering: an id that never earned a number is a review
  // finding, not a reader-facing "?" — it simply does not render here.
  const citations = referenceIds.flatMap((referenceId) => {
    const number = numbering.numbersById.get(referenceId);
    const reference = numbering.referencesById.get(referenceId);
    if (!number || !reference) return [];

    return [{
      accessibleLabel: msg("Citation {{number}}"),
      href: `#ref-${reference.id}`,
      label: String(number),
      referenceId,
    }];
  });
  if (citations.length === 0) return null;

  return renderCitationSup(citations, `marker-${referenceIds.join("-")}`);
}
