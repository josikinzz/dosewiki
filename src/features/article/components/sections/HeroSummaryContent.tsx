import { EditableSlot, EditableValue } from "../../editing";
import { CitedText } from "../CitedText";
import type { SubstanceArticle } from "@/schema";

interface HeroSummaryContentProps {
  article: SubstanceArticle;
  hasMolecule: boolean;
}

export function HeroSummaryContent({
  article,
  hasMolecule,
}: HeroSummaryContentProps) {
  const summary = article.summary;
  const hasSummary = summary?.trim().length > 0;

  if (!hasSummary) {
    return (
      <EditableSlot
        className="mt-8"
        emptyLabel="Add a summary"
        label="Summary"
        path="summary"
        value={summary ?? ""}
      />
    );
  }

  return (
    <EditableValue as="div" label="Summary" path="summary" value={summary}>
      <p
        className={`theme-article-hero-summary theme-text-primary mt-8 max-w-[72ch] pt-6 text-[0.9375rem] leading-relaxed whitespace-pre-wrap md:text-base break-words${
          hasMolecule ? " theme-article-hero-summary--has-molecule" : ""
        }`}
      >
        <CitedText text={summary} article={article} />
      </p>
    </EditableValue>
  );
}
