import { memo, type ReactNode } from "react";
import Link from "next/link";

import { DoseWikiLogo } from "../common/DoseWikiLogo";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { Icon } from "../common/Icon";
import { SiteLicenceNotice } from "../common/SiteLicenceNotice";
import { InteractiveContentCard } from "@/components/ui/surface";
import {
  ContributorCard,
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import type { NormalizedUserProfile } from "../../data/userProfiles";
import type { AboutPreviewSnapshot } from "./aboutArchiveSnapshot";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";
import { AboutArchivePreview } from "./AboutArchivePreview";
import { AboutPageTabs } from "./AboutPageTabs";
import { MoleculeDownloadPack } from "./MoleculeDownloadPack";

const DEFAULT_TAGLINE = SITE_FLAVOR_CONFIG.description;
const ABOUT_CONFIG = SITE_FLAVOR_CONFIG.about;

/**
 * Column count follows the card count so neither flavor strands a card on a row of its own:
 * dose.wiki ships three documentation cards, Effect Index four licensing/contact ones.
 */
const DOC_GRID_COLUMNS =
  ABOUT_CONFIG.docLinks.length % 2 === 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3";

interface AboutPageProps {
  founderProfiles: NormalizedUserProfile[];
  previewSnapshots: AboutPreviewSnapshot[];
  missionContent?: ReactNode;
  /** Editor-managed tagline from Convex siteConfig; falls back to the canonical line. */
  subtitle?: string;
  moleculeCount: number;
}

export const AboutPage = memo(function AboutPage({
  founderProfiles,
  previewSnapshots,
  missionContent,
  subtitle,
  moleculeCount,
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
                  width={96}
                  height={96}
                  className="h-44 w-44 sm:h-24 sm:w-24"
                  draggable={false}
                />
                <div>
                  <h1 className="theme-accent-heading font-display break-words text-[2.5rem] font-bold leading-tight tracking-tight sm:text-[3.2rem]">
                    {SITE_FLAVOR_CONFIG.aboutTitle}
                  </h1>
                  <p className="theme-text-faint mt-2 text-lg font-medium">
                    {subtitle?.trim() || DEFAULT_TAGLINE}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <AboutPageTabs
          mission={
            <section className="space-y-6">
              <PublicSectionHeading
                icon="lucide:compass"
                title="Project Mission"
              />

              <div className="px-0 py-2">{missionContent}</div>
            </section>
          }
          // The panel's exports are dose.wiki's own — the molecule pack, SubstanceIndex.json
          // and the dose.wiki repository — so a flavor that does not ship them drops the tab
          // rather than advertising another publication's downloads under its own licence.
          data={
            ABOUT_CONFIG.showOpenData ? (
              <section className="space-y-6">
                <PublicSectionHeading
                  icon="lucide:database"
                  title="Open Data & Tools"
                />

                <AboutArchivePreview previewSnapshots={previewSnapshots} />

                <MoleculeDownloadPack moleculeCount={moleculeCount} />

                {/* Reuse terms follow the publication: dose.wiki's CC0/MIT dedication is
                    not Effect Index's licence, so this sentence is flavored rather than
                    written inline. */}
                <SiteLicenceNotice
                  className="theme-text-faint text-sm leading-6"
                  notice={ABOUT_CONFIG.reuseNotice}
                />
              </section>
            ) : undefined
          }
          contributors={
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
                    Contributor profiles are on their way — check back soon.
                  </p>
                </div>
              )}
            </section>
          }
          docsLabel={ABOUT_CONFIG.docsTitle}
          docs={
            <section className="space-y-6">
              <PublicSectionHeading
                icon="lucide:book-open"
                title={ABOUT_CONFIG.docsTitle}
              />

              {/* Without the Open Data tab this is the only place the reuse terms appear,
                  and it is where they belong: alongside the licence card. */}
              {ABOUT_CONFIG.showOpenData ? null : (
                <SiteLicenceNotice
                  className="theme-text-faint text-sm leading-6"
                  notice={ABOUT_CONFIG.reuseNotice}
                />
              )}

              <ul className={cn("grid gap-4", DOC_GRID_COLUMNS)}>
                {ABOUT_CONFIG.docLinks.map((doc) => (
                  <li key={doc.href}>
                    <InteractiveContentCard
                      asChild
                      padding="md"
                      className="group flex h-full flex-col gap-2"
                    >
                      <Link href={doc.href} scroll={false}>
                        <span className="theme-accent-heading flex items-center gap-2 font-medium">
                          <Icon icon={doc.icon} size={18} />
                          {doc.title}
                        </span>
                        <span className="theme-text-faint text-sm leading-6">{doc.description}</span>
                      </Link>
                    </InteractiveContentCard>
                  </li>
                ))}
              </ul>
            </section>
          }
        />
      </div>
    </PublicContentShell>
  );
});
