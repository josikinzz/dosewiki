import { memo, type ReactNode } from "react";

import { AppImage } from "../common/AppImage";
import {
  ContributorCard,
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import type { NormalizedUserProfile } from "../../data/userProfiles";
import type { SubstanceArticle } from "../../schema";
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
    <PublicContentShell focusTarget className="pb-24">
      <div className="space-y-12">
        {/* Hero Section */}
        <div className="mb-10">
          <div className="theme-public-card relative flex flex-col gap-6 overflow-hidden rounded-2xl border p-6 sm:p-8">
            {/* Decorative background glow */}
            <div
              className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[80px]"
              aria-hidden="true"
            />

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
                  <h1 className="theme-accent-heading font-display break-words text-[2.5rem] font-bold leading-tight tracking-tight sm:text-[3.2rem]">
                    About dose.wiki
                  </h1>
                  <p className="theme-text-faint mt-2 text-lg font-medium">
                    The open-source encyclopedia of psychoactive substances
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <section className="space-y-6">
          <PublicSectionHeading
            icon="lucide:book-open"
            title="Project Mission"
          />

          <div className="theme-public-card rounded-2xl border p-5 sm:p-6">{missionContent}</div>
        </section>

        {/* Data & Tools */}
        <section className="space-y-6">
          <PublicSectionHeading
            icon="lucide:database"
            title="Open Data & Tools"
          />

          <AboutArchivePreview previewArticles={previewArticles} />
        </section>

        {/* Founders */}
        <section className="space-y-6">
          <PublicSectionHeading
            icon="lucide:users"
            title="Founders & Contributors"
          />

          {founders.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {founders.map((profile) => (
                <li key={profile.key}>
                  <ContributorCard
                    contributor={profile}
                    href={publicHref.contributor(profile.key)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="theme-public-card-subtle rounded-2xl border border-dashed p-8 text-center">
              <p className="theme-text-faint text-sm">
                Founder profiles have not been published yet. Pin contributors
                from the Dev Tools About tab to surface them here.
              </p>
            </div>
          )}
        </section>
      </div>
    </PublicContentShell>
  );
});
