import { memo, type ReactNode } from "react";
import Link from "next/link";

import { DoseWikiLogo } from "../common/DoseWikiLogo";
import { Icon } from "../common/Icon";
import {
  ContributorCard,
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import type { NormalizedUserProfile } from "../../data/userProfiles";
import type { SubstanceArticle } from "../../schema";
import { publicHref } from "@/utils/publicHref";
import { AboutArchivePreview } from "./AboutArchivePreview";
import { MoleculeDownloadPack } from "./MoleculeDownloadPack";

const DOC_LINKS = [
  {
    href: "/docs/how",
    icon: "lucide:workflow",
    title: "How articles are made",
    description: "The full content pipeline — sources, synthesis, human review, and citations.",
  },
  {
    href: "/docs/code",
    icon: "lucide:code-2",
    title: "How dose.wiki is built",
    description: "A tour of the codebase: architecture, the data layer, and the systems behind the site.",
  },
  {
    href: "/docs/license",
    icon: "lucide:scale",
    title: "License & reuse",
    description: "What you can do with our content, dataset, code, and the parts we don't own.",
  },
] as const;

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

  return (
    <PublicContentShell focusTarget className="pb-24">
      <div className="space-y-12">
        {/* Hero Section */}
        <div className="mb-10">
          <div className="relative flex flex-col gap-6 py-6 sm:py-8">
            {/* Decorative background glow */}
            <div
              className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-[color:color-mix(in_srgb,var(--theme-accent)_12%,transparent)] blur-[80px]"
              aria-hidden="true"
            />

            <div className="relative flex flex-col gap-6">
              {/* Title with icon */}
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:flex-wrap sm:justify-start sm:gap-6 sm:text-left">
                <DoseWikiLogo
                  alt="dose.wiki logo"
                  width={96}
                  height={96}
                  className="h-44 w-44 sm:h-24 sm:w-24"
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

          <div className="px-0 py-2">{missionContent}</div>
        </section>

        {/* Data & Tools */}
        <section className="space-y-6">
          <PublicSectionHeading
            icon="lucide:database"
            title="Open Data & Tools"
          />

          <AboutArchivePreview previewArticles={previewArticles} />

          <MoleculeDownloadPack />

          <p className="theme-text-faint text-sm leading-6">
            Everything dose.wiki creates — its articles and the full dataset — is dedicated to the
            public domain under{" "}
            <Link href="/docs/license" scroll={false} className="theme-link-muted transition-colors">
              CC0
            </Link>
            : reuse it freely, no attribution required. The site&apos;s code is MIT; trip reports,
            interaction ratings, and reagent tests keep their own terms.
          </p>
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
            <div className="p-8 text-center">
              <p className="theme-text-faint text-sm">
                Founder profiles have not been published yet. Pin contributors
                from the Dev Tools About tab to surface them here.
              </p>
            </div>
          )}
        </section>

        {/* Documentation */}
        <section className="space-y-6">
          <PublicSectionHeading
            icon="lucide:book-open"
            title="Documentation"
          />

          <ul className="grid gap-4 sm:grid-cols-3">
            {DOC_LINKS.map((doc) => (
              <li key={doc.href}>
                <Link
                  href={doc.href}
                  scroll={false}
                  className="group flex h-full flex-col gap-2 rounded-2xl border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-surface-muted))] p-5 transition-colors hover:border-white/20 hover:bg-[color-mix(in_srgb,#fff_10%,var(--theme-surface-muted))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <span className="theme-accent-heading flex items-center gap-2 font-medium">
                    <Icon icon={doc.icon} size={18} />
                    {doc.title}
                  </span>
                  <span className="theme-text-faint text-sm leading-6">{doc.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PublicContentShell>
  );
});
