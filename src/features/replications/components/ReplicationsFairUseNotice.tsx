import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { publicMarkdownComponents } from "@/components/pages/PublicMarkdownBody";

/**
 * The shared public prose map, stepped down to footnote weight: the notice
 * sits under the whole gallery and should read as quiet standing text, not as
 * article body copy. Links (mailto, the licensing-terms route) keep the shared
 * treatment; only the paragraph tier shrinks. The same composition move as
 * `AboutMissionMarkdown`, which also overrides one element on top of the map.
 */
const noticeMarkdownComponents = {
  ...publicMarkdownComponents,
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="theme-text-muted mt-3 text-sm leading-6 first:mt-0" {...props} />
  ),
};

/**
 * The gallery's fair-use / takedown notice, server-rendered from the
 * `replications-fair-use-notice` copy block. It replaces the short rights
 * footnote the explorer draws elsewhere (`rightsFootnote` prop), so the
 * gallery page states its rights position exactly once.
 */
export function ReplicationsFairUseNotice({ body }: { body: string }) {
  return (
    <section
      aria-label="Fair use and takedown notice"
      className="mx-auto mt-10 w-full max-w-3xl px-1"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={noticeMarkdownComponents}>
        {body}
      </ReactMarkdown>
    </section>
  );
}
