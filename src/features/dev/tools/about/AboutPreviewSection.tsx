import { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { AppImage } from "@/components/common/AppImage";
import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { NestedContentCard } from "@/components/ui/surface";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { toInitials } from "@/lib/text";

const markdownComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="theme-text-secondary mt-3 text-[0.95rem] leading-7 first:mt-0" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => (
    <strong className="theme-accent-heading" {...props} />
  ),
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="theme-link-muted transition-colors"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="theme-text-secondary mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="theme-text-secondary mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => (
    <li className="marker:text-[color:var(--theme-accent)]" {...props} />
  ),
};

const DEFAULT_SUBTITLE = "Structured psychoactive data for quick reference and research workflows.";

type AboutPreviewSectionProps = {
  resolvedSubtitle: string;
  resolvedPreviewMarkdown: string;
  selectedFounders: NormalizedUserProfile[];
};

export function AboutPreviewSection({
  resolvedSubtitle,
  resolvedPreviewMarkdown,
  selectedFounders,
}: AboutPreviewSectionProps) {
  return (
    <SectionCard className="space-y-6">
      <h2 className="theme-accent-heading text-lg font-semibold">Live preview</h2>
      <NestedContentCard variant="subtle" padding="lg" radius="xl" className="space-y-8">
        <div className="flex flex-col items-center text-center">
          <DoseWikiLogo
            alt="dose.wiki logo"
            width={96}
            height={96}
            className="h-20 w-20 animate-[spin_30s_linear_infinite] md:h-24 md:w-24"
            draggable={false}
          />
          <div className="mt-6 flex flex-col gap-3 text-center">
            <div className="theme-accent-heading flex items-center justify-center gap-3 text-2xl font-semibold tracking-tight md:text-3xl">
              <Icon icon="lucide:info" className="h-7 w-7" size={28} />
              <span>About dose.wiki</span>
            </div>
            <p className="theme-text-muted text-base md:text-lg">
              {resolvedSubtitle.length > 0 ? resolvedSubtitle : DEFAULT_SUBTITLE}
            </p>
          </div>
        </div>

        <NestedContentCard variant="subtle" padding="lg" radius="lg">
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
              {resolvedPreviewMarkdown}
            </ReactMarkdown>
          </div>
        </NestedContentCard>

        <NestedContentCard variant="subtle" padding="lg" radius="lg">
          <div className="space-y-2">
            <h3 className="theme-accent-heading text-xl font-semibold">Founders</h3>
          </div>
          {selectedFounders.length > 0 ? (
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {selectedFounders.map((profile) => {
                const initials = toInitials(profile.displayName || profile.key);
                return (
                  <li key={profile.key} className="group">
                    <div className="theme-article-subsection-card flex items-center gap-4 rounded-2xl border p-4 transition group-hover:border-[color:var(--theme-article-route-active-border)] group-hover:bg-[color:var(--theme-article-route-active-bg)]">
                      <div className="theme-article-subsection-card-nested relative h-14 w-14 overflow-hidden rounded-full border text-center text-base font-semibold theme-text-secondary shadow-inner shadow-black/20">
                        {profile.avatarUrl ? (
                          <AppImage
                            src={profile.avatarUrl}
                            alt=""
                            width={56}
                            height={56}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-lg">{initials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold theme-text-primary">
                          {profile.displayName}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] theme-text-faint">
                          @{profile.key.toLowerCase()}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <NestedContentCard variant="subtle" padding="sm" radius="lg" className="mt-6 text-sm theme-text-muted">
              Founder profiles have not been published yet. Pin contributors from the Dev Tools About tab to surface them here.
            </NestedContentCard>
          )}
        </NestedContentCard>
      </NestedContentCard>
    </SectionCard>
  );
}
