import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { publicMarkdownComponents } from "@/components/pages/PublicMarkdownBody";

/**
 * The shared public prose map, stepped down to footnote weight: the notice
 * introduces the gallery rather than arguing with it, so it reads as quiet
 * standing text, not as article body copy. Links (mailto, the licensing-terms
 * route) keep the shared treatment; only the paragraph tier shrinks. The same
 * composition move as `AboutMissionMarkdown`, which also overrides one element
 * on top of the map.
 */
const noticeMarkdownComponents = {
  ...publicMarkdownComponents,
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="theme-text-muted mt-3 text-sm leading-6 first:mt-0" {...props} />
  ),
};

/**
 * The gallery's fair-use / takedown notice, server-rendered from the
 * `replications-fair-use-notice` copy block. It sits between the section intro
 * and the gallery, and replaces the short rights footnote the explorer draws
 * elsewhere (`rightsFootnote` prop), so the page states its rights position
 * exactly once and states it before the art rather than after it.
 *
 * The outer measure matches the section header and the gallery card
 * (`max-w-7xl`) so every element on the page shares one left edge; the prose
 * itself keeps the header description's narrower reading measure.
 */
export function ReplicationsFairUseNotice({ body }: { body: string }) {
  return (
    <section
      aria-label="Fair use and takedown notice"
      className="mx-auto mt-4 w-full max-w-7xl px-1"
    >
      <div className="max-w-3xl">
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={noticeMarkdownComponents}
        >
          {body}
        </ReactMarkdown>
      </div>
    </section>
  );
}
