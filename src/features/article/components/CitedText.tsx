import type { ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import { CITE_TOKEN_PATTERN, buildCitationNumbering } from "@/lib/citations/referenceModel";

function renderCitationSup(label: string, href: string, key: string) {
  return (
    <sup key={key} className="ml-0.5 align-super text-[0.7em] leading-none">
      <a
        href={href}
        className="rounded px-0.5 font-medium tabular-nums text-fuchsia-200 no-underline transition-colors hover:text-fuchsia-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
      >
        [{label}]
      </a>
    </sup>
  );
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
