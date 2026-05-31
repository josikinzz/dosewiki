import { memo, type ReactNode } from "react";

import { Icon } from "../common/Icon";
import { AppImage } from "../common/AppImage";
import type { NormalizedUserProfile } from "../../data/userProfiles";
import type { SubstanceArticle } from "../../schema";
import { toInitials } from "@/lib/text";
import { publicHref } from "@/utils/publicHref";
import { AboutArchivePreview } from "./AboutArchivePreview";

interface AboutPageProps {
  founderProfiles: NormalizedUserProfile[];
  previewArticles: SubstanceArticle[];
  missionContent?: ReactNode;
}

export const AboutPage = memo(function AboutPage({
  founderProfiles,
  previewArticles,
  missionContent,
}: AboutPageProps) {
  const founders = founderProfiles;

  const logoSrc = "/dosewiki-logo.png";

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-12 md:px-8">
        <div className="space-y-12">
          
          {/* Hero Section */}
          <div className="mb-10">
            <div className="relative flex flex-col gap-6">
              {/* Decorative background glow */}
              <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[80px]" aria-hidden="true" />
              
              <div className="flex flex-col gap-6">
                {/* Title with icon */}
                <div className="flex flex-wrap items-center gap-6">
                  <AppImage
                    src={logoSrc}
                    alt="dose.wiki logo"
                    width={96}
                    height={96}
                    className="h-24 w-24"
                    draggable={false}
                  />
                  <div>
                    <h1 className="font-display break-words text-[2.5rem] font-bold leading-tight tracking-tight text-fuchsia-300 sm:text-[3.2rem]">
                      About dose.wiki
                    </h1>
                    <p className="mt-2 text-lg text-white/60 font-medium">
                      The open-source encyclopedia of psychoactive substances
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <h2 className="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-2xl font-bold tracking-tight text-fuchsia-300">
                  <Icon icon="lucide:book-open" className="h-8 w-8" />
                  Project Mission
                </h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
            </div>
            
            <div className="relative px-4 py-2">
              {missionContent}
            </div>
          </section>

          {/* Data & Tools */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <h2 className="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-2xl font-bold tracking-tight text-fuchsia-300">
                  <Icon icon="lucide:database" className="h-8 w-8" />
                  Open Data & Tools
                </h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
            </div>

            <AboutArchivePreview previewArticles={previewArticles} />
          </section>

          {/* Founders */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <h2 className="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-2xl font-bold tracking-tight text-fuchsia-300">
                  <Icon icon="lucide:users" className="h-8 w-8" />
                  Founders & Contributors
                </h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
            </div>

            {founders.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {founders.map((profile) => {
                  const contributorHref = publicHref.contributor(profile.key);
                  const initials = toInitials(profile.displayName || profile.key);

                  return (
                    <li key={profile.key} className="group">
                      <a
                        href={contributorHref}
                        className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-[background-color,border-color,box-shadow] hover:bg-white/[0.05] hover:border-fuchsia-500/15 hover:shadow-lg hover:shadow-fuchsia-500/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                      >
                        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-fuchsia-500/5 blur-lg group-hover:bg-fuchsia-500/10 transition-colors" />
                        
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5 text-center text-base font-semibold text-white/80 shadow-inner shadow-black/20 ring-1 ring-white/5 group-hover:ring-fuchsia-500/30 transition">
                          {profile.avatarUrl ? (
                            <AppImage
                              src={profile.avatarUrl}
                              alt={`${profile.displayName} avatar`}
                              width={56}
                              height={56}
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-lg">{initials}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-white/90 group-hover:text-white transition">
                            {profile.displayName}
                          </p>
                          <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.15em] text-fuchsia-300/60 group-hover:text-fuchsia-300/80 transition-colors">
                            @{profile.key.toLowerCase()}
                          </p>
                        </div>
                        <Icon icon="lucide:arrow-right" className="h-5 w-5 text-white/30 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,translate,color] duration-300" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <p className="text-sm text-white/60">
                  Founder profiles have not been published yet. Pin contributors from the Dev Tools About tab to surface them here.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
});
