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
    <blockquote className="my-6 border-l border-fuchsia-400/50 pl-4 sm:pl-5">
      <div className="type-supporting-copy text-white/80 italic">
        {children}
      </div>
      {(author || source) && (
        <footer className="mt-2 text-[0.8125rem] leading-6 text-white/50">
          {author && <span className="font-medium text-fuchsia-200/70">{author}</span>}
          {author && source && <span> — </span>}
          {source && <cite className="not-italic">{source}</cite>}
        </footer>
      )}
    </blockquote>
  );
}
