import { Fragment } from "react";
import { cn } from "@/lib/utils";

export interface HighlightedTextProps {
  text: string;
  query: string;
  className?: string;
  markClassName?: string;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTerms(query: string) {
  return Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 1),
    ),
  );
}

interface HighlightPattern {
  terms: string[];
  pattern: RegExp | null;
}

let lastHighlightPattern: (HighlightPattern & { query: string }) | null = null;

function getHighlightPattern(query: string): HighlightPattern {
  if (lastHighlightPattern?.query === query) {
    return lastHighlightPattern;
  }

  const terms = getTerms(query);
  const pattern =
    terms.length > 0 ? new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig") : null;

  lastHighlightPattern = { query, terms, pattern };
  return lastHighlightPattern;
}

export function HighlightedText({
  text,
  query,
  className,
  markClassName,
}: HighlightedTextProps) {
  const { terms, pattern } = getHighlightPattern(query);

  if (!pattern) {
    return <span className={className}>{text}</span>;
  }

  const segments = text.split(pattern);

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        const isMatch = terms.some((term) => term.toLowerCase() === segment.toLowerCase());
        if (!isMatch) {
          return <Fragment key={`${segment}-${index}`}>{segment}</Fragment>;
        }

        return (
          <mark
            key={`${segment}-${index}`}
            className={cn(
              "rounded-chip bg-[var(--theme-search-highlight-bg)] px-1 py-0.5 text-[var(--theme-search-highlight-text)] shadow-[var(--theme-elevation-mark-hairline)]",
              markClassName,
            )}
          >
            {segment}
          </mark>
        );
      })}
    </span>
  );
}
