import { PropsWithChildren } from "react";

interface QuoteProps {
  author?: string;
  source?: string;
}

/**
 * Block quote with author attribution.
 * 
 * Used for personal commentary and external quotes.
 */
export function Quote({ 
  author, 
  source, 
  children,
}: PropsWithChildren<QuoteProps>) {
  return (
    <blockquote className="my-4 pl-4 border-l-2 border-fuchsia-400/50">
      <div className="text-sm text-white/80 italic leading-relaxed">
        {children}
      </div>
      {(author || source) && (
        <footer className="mt-2 text-xs text-white/50">
          {author && <span className="font-medium text-fuchsia-200/70">{author}</span>}
          {author && source && <span> — </span>}
          {source && <cite className="not-italic">{source}</cite>}
        </footer>
      )}
    </blockquote>
  );
}
