import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { NotebookText } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";

interface NotesSectionProps {
  notes: string;
}

export function NotesSection({ notes }: NotesSectionProps) {
  const normalizedNotes = useMemo(() => {
    return notes.replace(/^\s*•\s?/gm, "- ");
  }, [notes]);

  if (!normalizedNotes.trim()) {
    return null;
  }

  return (
    <SectionCard delay={0.3}>
      <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
        <IconBadge icon={NotebookText} label="Notes" />
        Notes
      </h2>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ node, ...props }) => (
            <p
              className="mt-3 text-[0.95rem] leading-7 text-white/85 first:mt-0"
              {...props}
            />
          ),
          ul: ({ node, ...props }) => (
            <ul
              className="mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85"
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85"
              {...props}
            />
          ),
          li: ({ node, ...props }) => (
            <li className="marker:text-fuchsia-300" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="text-white" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a
              className="text-fuchsia-200 underline decoration-dotted underline-offset-4 transition hover:text-fuchsia-100"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
        }}
      >
        {normalizedNotes}
      </ReactMarkdown>
    </SectionCard>
  );
}
