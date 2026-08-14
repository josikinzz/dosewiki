import { memo, type ReactNode } from "react";
import Link from "next/link";

import { DoseWikiLogo } from "../common/DoseWikiLogo";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { Icon } from "../common/Icon";
import { SiteLicenceNotice } from "../common/SiteLicenceNotice";
import { SiteSupporter } from "../common/SiteSupporter";
import { InteractiveContentCard } from "@/components/ui/surface";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import {
  ContributorCard,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import type { NormalizedUserProfile } from "../../data/userProfiles";
import {
  CONTRIBUTOR_ROSTER_ORDER_NOTE,
  CURATED_FOUNDERS_SECTION_TITLE,
  EFFECT_INDEX_FOUNDER_ROLE_FALLBACK,
  formatContributorRosterSubtitle,
  type ContributorRoster,
  type ContributorRosterEntry,
} from "../../data/contributorRoster";
import type { AboutPreviewSnapshot } from "./aboutArchiveSnapshot";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";
import { AboutArchivePreview } from "./AboutArchivePreview";
import { MoleculeDownloadPack } from "./MoleculeDownloadPack";

const DEFAULT_TAGLINE = SITE_FLAVOR_CONFIG.description;
const ABOUT_CONFIG = SITE_FLAVOR_CONFIG.about;

/**
 * Column count follows the card count so neither flavor strands a card on a row of its own:
 * dose.wiki ships three documentation cards, Effect Index four licensing/contact ones.
 */
const DOC_GRID_COLUMNS =
  ABOUT_CONFIG.docLinks.length % 2 === 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3";

/** Eyebrow above the pinned founder card. */
const FOUNDER_GROUP_LABEL = "Founder";

/** Eyebrow above the ranked contributor grid. */
const CONTRIBUTORS_GROUP_LABEL = "Contributors";

const GROUP_LABEL_CLASSNAME =
  "theme-text-faint text-xs font-bold uppercase tracking-[0.15em]";

function rosterCardHref(entry: ContributorRosterEntry): string {
  return publicHref.contributor(entry.profile.key);
}

/**
 * Effect Index's roster panel: the founder in her own labelled region, then everybody else in
 * a directory grid ordered by page credits.
 *
 * The founder is a separate region rather than the first grid cell on purpose — a reader has
 * to be able to see *why* she is first, and the position must not depend on her out-ranking
 * everyone on reference count.
 */
function ContributorRosterPanel({ roster }: { roster: ContributorRoster }) {
  const { founder, contributors } = roster;

  return (
    <div className="space-y-8">
      <p className="theme-text-faint text-sm leading-6">{CONTRIBUTOR_ROSTER_ORDER_NOTE}</p>

      {founder ? (
        <div className="space-y-3">
          <p className={GROUP_LABEL_CLASSNAME}>{FOUNDER_GROUP_LABEL}</p>
          <ContributorCard
            contributor={{
              ...founder.profile,
              subtitle: formatContributorRosterSubtitle(founder, {
                roleFallback: EFFECT_INDEX_FOUNDER_ROLE_FALLBACK,
              }),
            }}
            href={rosterCardHref(founder)}
            className="sm:max-w-lg"
          />
        </div>
      ) : null}

      {contributors.length > 0 ? (
        <div className="space-y-3">
          <p className={GROUP_LABEL_CLASSNAME}>
            {CONTRIBUTORS_GROUP_LABEL} · {contributors.length}
          </p>
          {/* Three columns at the wide breakpoint: ~25 cards in two columns reads as a wall. */}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {contributors.map((entry) => (
              <li key={entry.profile.key}>
                <ContributorCard
                  contributor={{
                    ...entry.profile,
                    subtitle: formatContributorRosterSubtitle(entry),
                  }}
                  href={rosterCardHref(entry)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

interface AboutPageProps {
  /** dose.wiki's editor-curated founder cards. Empty when `contributorRoster` is supplied. */
  founderProfiles: NormalizedUserProfile[];
  /**
   * Effect Index's full contributor roster: every profile, the founder pinned, the rest ranked
   * by page credits. Absent on a flavor that keeps the curated founder list, which renders the
   * original markup untouched.
   */
  contributorRoster?: ContributorRoster | null;
  /** Heading and tab-panel label for the contributor section. Flavored with the content. */
  contributorsSectionTitle?: string;
  previewSnapshots: AboutPreviewSnapshot[];
  missionContent?: ReactNode;
  /** Editor-managed tagline from Convex siteConfig; falls back to the canonical line. */
  subtitle?: string;
  moleculeCount: number;
}

export const AboutPage = memo(function AboutPage({
  founderProfiles,
  contributorRoster = null,
  contributorsSectionTitle = CURATED_FOUNDERS_SECTION_TITLE,
  previewSnapshots,
  missionContent,
  subtitle,
  moleculeCount,
}: AboutPageProps) {
  const founders = founderProfiles;
  const hasRosterEntries =
    contributorRoster !== null &&
    (contributorRoster.founder !== null || contributorRoster.contributors.length > 0);

  // One anchor per rendered section, in page order. The ids are the old tab
  // hash ids (`#data` is linked from the About markdown itself), so deep links
  // written against the tabbed page still land on the right section.
  const tocItems: PublicTableOfContentsItem[] = [
    { id: "mission", label: "Mission", icon: "lucide:compass" },
    { id: "docs", label: ABOUT_CONFIG.docsTitle, icon: "lucide:book-open" },
    ...(ABOUT_CONFIG.showOpenData
      ? [{ id: "data", label: "Downloads", icon: "lucide:download" } satisfies PublicTableOfContentsItem]
      : []),
    { id: "contributors", label: contributorsSectionTitle, icon: "lucide:users" },
  ];

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell min-h-screen pb-24 focus:outline-none"
    >
      <StickyTocLayout
        toc={<PublicTableOfContents items={tocItems} variant="bare" />}
        maxWidthClass="max-w-4xl"
        className="theme-toc-strip-scope"
        contentClassName="gap-12"
      >
        {/* Mobile/tablet TOC: sticky chip strip above the hero, pinned under
            the site header from the very first scroll; replaced by the sticky
            gutter TOC at >=1200px. */}
        <PublicTocStrip items={tocItems} />

        {/* Hero Section */}
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

        <section id="mission" className="space-y-6">
          <PublicSectionHeading icon="lucide:compass" title="Project Mission" />

          <div className="px-0 py-2">{missionContent}</div>
        </section>

        <section id="docs" className="space-y-6">
          <PublicSectionHeading icon="lucide:book-open" title={ABOUT_CONFIG.docsTitle} />

          {/* Without the Open Data section this is the only place the reuse terms
              appear, and it is where they belong: alongside the licence card. */}
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

        {/* The section's exports are dose.wiki's own — the molecule pack, the
            dataset downloads and the dose.wiki repository — so a flavor that
            does not ship them drops the section rather than advertising
            another publication's downloads under its own licence. */}
        {ABOUT_CONFIG.showOpenData ? (
          <section id="data" className="space-y-6">
            <PublicSectionHeading icon="lucide:download" title="Downloads" />

            <AboutArchivePreview
              previewSnapshots={previewSnapshots}
              aside={<MoleculeDownloadPack moleculeCount={moleculeCount} />}
            />

            {/* Reuse terms follow the publication: dose.wiki's CC0/MIT dedication is
                not Effect Index's licence, so this sentence is flavored rather than
                written inline. */}
            <SiteLicenceNotice
              className="theme-text-faint text-sm leading-6"
              notice={ABOUT_CONFIG.reuseNotice}
            />
          </section>
        ) : null}

        <section id="contributors" className="space-y-6">
          <PublicSectionHeading icon="lucide:users" title={contributorsSectionTitle} />

          {hasRosterEntries && contributorRoster ? (
            <ContributorRosterPanel roster={contributorRoster} />
          ) : founders.length > 0 ? (
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

          {/* Infrastructure credit, mirroring the homepage/footer lockup. Renders
              nothing on a flavor that declares no supporter. */}
          <div className="flex justify-center pt-2">
            <SiteSupporter align="center" markHeightRem={2.25} />
          </div>
        </section>
      </StickyTocLayout>
    </main>
  );
});
