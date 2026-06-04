import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

const bioComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="theme-text-secondary mt-4 text-[1.0625rem] leading-7 first:mt-0" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => <strong className="theme-accent-emphasis font-semibold" {...props} />,
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="theme-profile-markdown-link font-medium transition hover:underline hover:underline-offset-2"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="theme-profile-markdown-marker theme-text-secondary mt-4 list-disc space-y-2 pl-6 text-[1.0625rem]" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="theme-profile-markdown-marker theme-text-secondary mt-4 list-decimal space-y-2 pl-6 text-[1.0625rem]" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => (
    <li className="pl-1" {...props} />
  ),
  blockquote: ({ node: _node, ...props }: { node?: unknown }) => (
    <blockquote className="theme-profile-markdown-quote mt-6 rounded-lg px-5 py-4 italic" {...props} />
  ),
};

export function ProfileBioMarkdown({ content }: { content: string }) {
  return (
    <div className="theme-profile-markdown max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={bioComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
