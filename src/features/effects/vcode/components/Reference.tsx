"use client";

import { CitationSup } from "@/features/article/components/CitedText";
import { scrollIntoViewRespectingMotion } from "@/utils/navigation";
import { getEffectReferenceTarget } from "@/lib/citationProjection";

interface ReferenceProps {
  to?: string;
  citations?: Array<{ url: string; text: string; from?: string }>;
}

/**
 * Inline citation marker for effect articles.
 *
 * Shares the substance article's marker construction (CitationSup chip) and
 * scrolls to the citation in the References section, Wikipedia-style.
 */
export function Reference({ to, citations = [] }: ReferenceProps) {
  if (!to) return null;

  const target = getEffectReferenceTarget(to, citations);

  const handleClick = (
    _citation: unknown,
    e: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    e.preventDefault();

    // Scroll to the citation in the References section
    const element = document.getElementById(target.anchorId);
    if (element) {
      scrollIntoViewRespectingMotion(element);
      // Briefly highlight the citation
      element.dataset.navigationHighlight = "true";
      setTimeout(() => {
        delete element.dataset.navigationHighlight;
      }, 2000);
    }

    const hash = `#${target.anchorId}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  };

  return (
    <CitationSup
      citations={[
        {
          accessibleLabel: `Citation ${target.number}`,
          href: `#${target.anchorId}`,
          label: String(target.number),
          title: target.label,
        },
      ]}
      onCitationClick={handleClick}
    />
  );
}
