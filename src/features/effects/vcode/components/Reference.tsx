import { scrollIntoViewRespectingMotion } from "@/utils/navigation";

interface ReferenceProps {
  to?: string;
  citations?: Array<{ url: string; text: string; from?: string }>;
}

/**
 * Citation reference marker.
 * 
 * Renders as a superscript number that scrolls to the citation in the
 * References section (Wikipedia-style behavior).
 */
export function Reference({ to, citations = [] }: ReferenceProps) {
  if (!to) return null;

  // Find the citation by its "from" field (which matches the ref "to" value)
  const citation = citations.find(c => c.from === to);
  const citationIndex = citation ? citations.indexOf(citation) + 1 : parseInt(to, 10);

  // Build the anchor ID matching the one in EffectCitationsSection
  const anchorId = citation?.from 
    ? `cite-${citation.from}` 
    : `cite-${citationIndex || to}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Scroll to the citation in the References section
    const element = document.getElementById(anchorId);
    if (element) {
      scrollIntoViewRespectingMotion(element);
      // Briefly highlight the citation
      element.classList.add("ring-2", "ring-fuchsia-400/50");
      setTimeout(() => {
        element.classList.remove("ring-2", "ring-fuchsia-400/50");
      }, 2000);
    }
    
    const hash = `#${anchorId}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  };

  return (
    <a
      href={`#${anchorId}`}
      onClick={handleClick}
      className="text-[10px] text-fuchsia-300 hover:text-fuchsia-200 cursor-pointer ml-0.5 align-super"
      title={citation?.text || `Reference ${to}`}
    >
      [{citationIndex || to}]
    </a>
  );
}
