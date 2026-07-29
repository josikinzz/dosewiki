import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { publicMarkdownComponents } from "./PublicMarkdownBody";

// The shared public prose component map now lives in `PublicMarkdownBody` so the archived
// Effect Index blog renders through the same styling. This page keeps its own first-
// paragraph override on top of it.

export function AboutMissionMarkdown({ content }: { content: string }) {
  return (
    <div className="max-w-none">
      <ReactMarkdown
        components={{
          ...publicMarkdownComponents,
          p: ({ node, children, ...props }) => {
            const isFirst = node?.position?.start.line === 1 || node?.position?.start.offset === 0;

            if (isFirst && typeof children === "string") {
              const [firstWord, ...rest] = children.split(" ");
              return (
                <p className="theme-text-primary mt-4 text-[1.125rem] leading-8 first:mt-0" {...props}>
                  <span className="theme-accent-heading font-bold">{firstWord}</span> {rest.join(" ")}
                </p>
              );
            }

            return (
              <p className="theme-text-secondary mt-4 text-[1.0625rem] leading-7 first:mt-0" {...props}>
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
