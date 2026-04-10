import { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { toInitials } from "@/lib/text";

const markdownComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="mt-3 text-[0.95rem] leading-7 text-white/85 first:mt-0" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => <strong className="text-fuchsia-200" {...props} />,
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="text-fuchsia-200 transition hover:text-fuchsia-100"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => (
    <li className="marker:text-fuchsia-300" {...props} />
  ),
};

const DEFAULT_SUBTITLE = "Structured psychoactive data for quick reference and research workflows.";

type AboutPreviewSectionProps = {
  logoSrc: string;
  resolvedSubtitle: string;
  resolvedPreviewMarkdown: string;
  selectedFounders: NormalizedUserProfile[];
};

export function AboutPreviewSection({
  logoSrc,
  resolvedSubtitle,
  resolvedPreviewMarkdown,
  selectedFounders,
}: AboutPreviewSectionProps) {
  return (
    <SectionCard className="space-y-6">
      <h2 className="text-lg font-semibold text-fuchsia-200">Live preview</h2>
      <div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col items-center text-center">
          <AppImage
            src={logoSrc}
            alt="dose.wiki logo"
            width={96}
            height={96}
            className="h-20 w-20 animate-[spin_30s_linear_infinite] md:h-24 md:w-24"
            draggable={false}
          />
          <div className="mt-6 flex flex-col gap-3 text-center">
            <div className="flex items-center justify-center gap-3 text-2xl font-semibold tracking-tight text-fuchsia-300 md:text-3xl">
              <Icon icon="lucide:info" className="h-7 w-7" size={28} />
              <span>About dose.wiki</span>
            </div>
            <p className="text-base text-white/70 md:text-lg">
              {resolvedSubtitle.length > 0 ? resolvedSubtitle : DEFAULT_SUBTITLE}
            </p>
          </div>
        </div>

        <div className="theme-editor-pane rounded-2xl border p-6">
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
              {resolvedPreviewMarkdown}
            </ReactMarkdown>
          </div>
        </div>

        <div className="theme-editor-pane rounded-2xl border p-6">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-fuchsia-200">Founders</h3>
          </div>
          {selectedFounders.length > 0 ? (
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {selectedFounders.map((profile) => {
                const initials = toInitials(profile.displayName || profile.key);
                return (
                  <li key={profile.key} className="group">
                    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm shadow-black/30 transition group-hover:border-fuchsia-400/60 group-hover:bg-fuchsia-500/10">
                      <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/10 text-center text-base font-semibold text-white/80 shadow-inner shadow-black/20">
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
                        <p className="truncate text-sm font-semibold text-white/90 group-hover:text-white">
                          {profile.displayName}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/45 group-hover:text-white/70">
                          @{profile.key.toLowerCase()}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
              Founder profiles have not been published yet. Pin contributors from the Dev Tools About tab to surface them here.
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
