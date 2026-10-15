import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { publicMarkdownComponents } from "@/components/pages/PublicMarkdownBody";
import { t } from "@/i18n/server";

const noticeMarkdownComponents = {
  ...publicMarkdownComponents,
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="theme-text-muted mt-3 text-sm leading-6 first:mt-0" {...props} />
  ),
};

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
