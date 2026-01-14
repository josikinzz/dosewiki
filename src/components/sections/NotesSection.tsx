import { useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { NotebookText } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { Bullet } from "../common/Bullet";

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
          p: ({ node: _node, ...props }: { node?: unknown }) => (
            <p
              className="mt-3 text-[0.95rem] leading-7 text-white/85 first:mt-0"
              {...props}
            />
          ),
          ul: ({ node: _node, ...props }: { node?: unknown }) => (
            <ul
              className="notes-custom-bullets mt-4 list-none space-y-2 pl-0 text-[0.95rem] leading-7 text-white/85"
              {...props}
            />
          ),
          ol: ({ node: _node, ...props }: { node?: unknown }) => (
            <ol
              className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85"
              {...props}
            />
          ),
          li: ({
            node,
            children,
            ...props
          }: {
            node?: { parent?: { type?: string; ordered?: boolean } };
            children?: ReactNode;
          }) => {
            // Use a more reliable check: if we're rendering inside a ul (which has notes-custom-bullets class),
            // we'll detect it by checking if the list is ordered
            // ReactMarkdown passes ordered property through context, but we can check node structure
            const isInOrderedList = node?.parent?.type === "list" && node?.parent?.ordered === true;
            
            if (isInOrderedList) {
              // Keep default styling for ordered lists
              return <li {...props}>{children}</li>;
            }
            
            // For unordered lists, use custom bullet with flex layout
            return (
              <li className="flex items-center gap-2" {...props}>
                <Bullet />
                <span className="flex-1">{children}</span>
              </li>
            );
          },
          strong: ({ node: _node, ...props }: { node?: unknown }) => (
            <strong className="text-white" {...props} />
          ),
          a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
            const { children, ...rest } = props;
            return (
              <a
                className="text-fuchsia-200 underline decoration-dotted underline-offset-4 transition hover:text-fuchsia-100"
                target="_blank"
                rel="noopener noreferrer"
                {...rest}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {normalizedNotes}
      </ReactMarkdown>
    </SectionCard>
  );
}
