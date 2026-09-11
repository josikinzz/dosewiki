import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { publicMarkdownComponents } from "@/components/pages/PublicMarkdownBody";
import { t } from "@/i18n/server";

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
 * The section's fair-use / takedown notice, server-rendered from the
 * `replications-fair-use-notice` copy block. It lives on the More Info tab,
 * which is the only route that renders it. The gallery index keeps the
 * explorer's short rights footnote (`rightsFootnote`) instead: the two are not
 * alternatives on one page, they are the long form and the short form on
 * different tabs, and suppressing the footnote in favour of a notice on
 * another route left the index stating its rights position nowhere.
 *
 * The outer measure matches the section header and the gallery card
 * (`max-w-7xl`) so every element on the page shares one left edge; the prose
 * itself keeps the header description's narrower reading measure.
 */
export function ReplicationsFairUseNotice({ body }: { body: string }) {
  return (
    <section
      aria-label={t("Fair use and takedown notice")}
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
