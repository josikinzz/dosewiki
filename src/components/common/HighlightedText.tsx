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

export function HighlightedText({
  text,
  query,
  className,
  markClassName,
}: HighlightedTextProps) {
  const terms = getTerms(query);

  if (terms.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
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
              "rounded-md bg-fuchsia-400/15 px-1 py-0.5 text-fuchsia-100 shadow-[inset_0_0_0_1px_rgba(244,114,182,0.18)]",
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
