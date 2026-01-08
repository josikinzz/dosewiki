import { memo } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { GeneratedArticle } from "../../../../../types/generatorSchema";

interface PreviewCitationsSectionProps {
  article: GeneratedArticle;
}

export const PreviewCitationsSection = memo(function PreviewCitationsSection({
  article,
}: PreviewCitationsSectionProps) {
  const { citations } = article;

  if (citations.length === 0) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={BookOpen} label="Citations" />
        Citations
      </h2>

      <ol className="space-y-2">
        {citations.map((citation, idx) => (
          <li
            key={idx}
            className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-fuchsia-400/30 hover:bg-white/8"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/20 text-xs font-medium text-fuchsia-300">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm text-white/80">{citation.name}</span>
              {citation.url && (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-fuchsia-300 hover:text-fuchsia-200"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate">{citation.url}</span>
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-white/50">
        {citations.length} source{citations.length !== 1 ? "s" : ""} cited
      </p>
    </SectionCard>
  );
});
