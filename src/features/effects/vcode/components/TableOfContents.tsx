import { scrollIntoViewRespectingMotion } from "@/utils/navigation";

interface TableOfContentsProps {
  subarticles?: Array<{ id: string; title: string }>;
}

/**
 * Table of contents for effect articles with subarticles.
 * 
 * Handles same-page anchor navigation by scrolling to the target element
 * and updating the URL hash. Does not trigger route navigation.
 */
export function TableOfContents({ 
  subarticles = [],
}: TableOfContentsProps) {
  if (subarticles.length === 0) {
    return null;
  }

  const handleClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Scroll to anchor
    const element = document.getElementById(id);
    if (element) {
      scrollIntoViewRespectingMotion(element);
    }
    
    const hash = `#${id}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  };

  return (
    <nav className="my-4 rounded-xl border border-[color:var(--theme-card-border)] bg-white/5 p-4">
      <h4 className="text-sm font-semibold text-fuchsia-300 mb-3">
        Contents
      </h4>
      <ul className="space-y-2">
        {subarticles.map((article, index) => (
          <li key={article.id}>
            <a
              href={`#${article.id}`}
              onClick={handleClick(article.id)}
              className="text-sm text-white/70 hover:text-fuchsia-200 transition-colors flex items-center gap-2"
            >
              <span className="text-white/40 text-xs w-4">{index + 1}.</span>
              {article.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
