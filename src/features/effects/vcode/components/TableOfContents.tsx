"use client";

import { Surface } from "@/components/ui/surface";
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
    <Surface asChild variant="effectPanel" padding="sm" radius="lg" className="my-4">
      <nav>
        <h4 className="theme-accent-heading mb-3 text-sm font-semibold">
          Contents
        </h4>
        <ul className="space-y-2">
          {subarticles.map((article, index) => (
            <li key={article.id}>
              <a
                href={`#${article.id}`}
                onClick={handleClick(article.id)}
                className="theme-text-secondary hover:text-[var(--theme-accent-strong)] flex items-center gap-2 text-sm transition-colors"
              >
                <span className="theme-text-faint w-4 text-xs">{index + 1}.</span>
                {article.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </Surface>
  );
}
