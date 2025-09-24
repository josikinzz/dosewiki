import { Library } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { CitationEntry } from "../../types/content";

interface CitationsSectionProps {
  citations: CitationEntry[];
}

export function CitationsSection({ citations }: CitationsSectionProps) {
  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <SectionCard delay={0.35}>
      <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
        <IconBadge icon={Library} label="Citations" />
        Citations
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {citations.map((citation) => (
          <li
            key={`${citation.label}-${citation.href ?? ''}`}
            className="flex items-center gap-2 text-white/85"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
            {citation.href ? (
              <a
                href={citation.href}
                className="cursor-pointer text-fuchsia-200 underline-offset-4 transition hover:text-fuchsia-100 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {citation.label}
              </a>
            ) : (
              <span className="transition-colors hover:text-white">
                {citation.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
