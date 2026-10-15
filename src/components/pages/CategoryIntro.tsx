import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type CategoryTabContent,
  hasCategoryTabContent,
} from "../../data/categoryTabContent";

const introComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p
      className="theme-text-secondary text-pretty text-[0.96875rem] leading-[1.62] sm:text-base sm:leading-[1.66] first:mt-0"
      {...props}
    />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => (
    <strong className="theme-accent-emphasis font-semibold" {...props} />
  ),
  em: ({ node: _node, ...props }: { node?: unknown }) => (
    <em className="theme-text-faint italic" {...props} />
  ),
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
};

interface CategoryIntroProps {
  content: CategoryTabContent | undefined;
  activeTab: string;
  showDivider?: boolean;
}

export function CategoryIntro({ content, activeTab, showDivider = true }: CategoryIntroProps) {
  if (!hasCategoryTabContent(content) || !content.definition) return null;

  return (
    <section
      key={activeTab}
      aria-label="Substance index tab introduction"
      className="theme-section-card-enter mx-auto mt-6 flex max-w-[70ch] flex-col px-4 text-left sm:mt-7"
    >
      {showDivider ? <span aria-hidden className="theme-horizontal-divider" /> : null}

      <div className={showDivider ? "mt-4" : undefined}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={introComponents}>
          {content.definition}
        </ReactMarkdown>
      </div>
    </section>
  );
}
