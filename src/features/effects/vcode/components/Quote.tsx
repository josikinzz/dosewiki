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
    <blockquote className="my-6 rounded-xl border border-[var(--theme-profile-markdown-quote-border)] bg-[color:var(--theme-profile-markdown-quote-bg)] py-3 pl-4 pr-4 sm:pl-5">
      <div className="type-supporting-copy theme-text-secondary italic">
        {children}
      </div>
      {(author || source) && (
        <footer className="theme-text-faint mt-2 text-[0.8125rem] leading-6">
          {author && <span className="theme-accent-emphasis font-medium">{author}</span>}
          {author && source && <span> — </span>}
          {source && <cite className="not-italic">{source}</cite>}
        </footer>
      )}
    </blockquote>
  );
}
