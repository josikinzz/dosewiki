import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

const bioComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="mt-4 text-[1.0625rem] leading-7 text-white/80 first:mt-0" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => <strong className="theme-accent-emphasis font-semibold" {...props} />,
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="font-medium text-fuchsia-300 transition hover:text-fuchsia-200 hover:underline hover:decoration-fuchsia-300/30 hover:underline-offset-2"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 text-[1.0625rem] text-white/80 marker:text-fuchsia-400/50" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6 text-[1.0625rem] text-white/80 marker:text-fuchsia-400/50" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => (
    <li className="pl-1" {...props} />
  ),
  blockquote: ({ node: _node, ...props }: { node?: unknown }) => (
    <blockquote className="mt-6 border-l-4 border-fuchsia-500/30 pl-4 italic text-white/70" {...props} />
  ),
};

export function ProfileBioMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-fuchsia max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={bioComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
