import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

const markdownComponents = {
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
  li: ({ node: _node, ...props }: { node?: unknown }) => <li className="pl-1" {...props} />,
  h1: ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => (
    <h1 className="theme-accent-heading mt-8 mb-4 text-2xl font-bold" {...props}>{children}</h1>
  ),
  h2: ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => (
    <h2 className="theme-accent-heading mt-8 mb-4 text-xl font-bold" {...props}>{children}</h2>
  ),
  h3: ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => (
    <h3 className="theme-accent-heading mt-6 mb-3 text-lg font-bold" {...props}>{children}</h3>
  ),
  blockquote: ({ node: _node, ...props }: { node?: unknown }) => (
    <blockquote className="mt-6 border-l-4 border-fuchsia-500/30 pl-4 italic text-white/70" {...props} />
  ),
};

export function AboutMissionMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-fuchsia max-w-none">
      <ReactMarkdown
        components={{
          ...markdownComponents,
          p: ({ node, children, ...props }) => {
            const isFirst = node?.position?.start.line === 1 || node?.position?.start.offset === 0;

            if (isFirst && typeof children === "string") {
              const [firstWord, ...rest] = children.split(" ");
              return (
                <p className="mt-4 text-[1.125rem] leading-8 text-white/90 first:mt-0" {...props}>
                  <span className="font-bold text-fuchsia-300">{firstWord}</span> {rest.join(" ")}
                </p>
              );
            }

            return (
              <p className="mt-4 text-[1.0625rem] leading-7 text-white/80 first:mt-0" {...props}>
                {children}
              </p>
            );
          },
        }}
        remarkPlugins={[remarkGfm, remarkBreaks]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
