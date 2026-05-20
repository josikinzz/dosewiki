import { scrollIntoViewRespectingMotion } from "@/utils/navigation";
import { getEffectReferenceTarget } from "@/lib/citationProjection";

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

  const target = getEffectReferenceTarget(to, citations);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Scroll to the citation in the References section
    const element = document.getElementById(target.anchorId);
    if (element) {
      scrollIntoViewRespectingMotion(element);
      // Briefly highlight the citation
      element.classList.add("ring-2", "ring-fuchsia-400/50");
      setTimeout(() => {
        element.classList.remove("ring-2", "ring-fuchsia-400/50");
      }, 2000);
    }
    
    const hash = `#${target.anchorId}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  };

  return (
    <a
      href={`#${target.anchorId}`}
      onClick={handleClick}
      className="text-[10px] text-fuchsia-300 hover:text-fuchsia-200 cursor-pointer ml-0.5 align-super"
      title={target.label}
    >
      [{target.number}]
    </a>
  );
}
