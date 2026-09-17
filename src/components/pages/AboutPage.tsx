import { memo, type ReactNode } from "react";
import Link from "next/link";

import { DoseWikiLogo } from "../common/DoseWikiLogo";
import { SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import { Icon } from "../common/Icon";
import { SiteLicenceNotice } from "../common/SiteLicenceNotice";
import { SiteSupporter } from "../common/SiteSupporter";
import { SiteVersionBadge } from "../common/SiteVersionBadge";
import { SiteWordmark } from "../common/SiteWordmark";
import { InteractiveContentCard } from "@/components/ui/surface";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import {
  ContributorCard,
  IconPillLink,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
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
import { t } from "@/i18n/server";
import { msg } from "@/i18n/messages";
import { publicHref } from "@/utils/publicHref";
import { AboutArchivePreview, type AboutDownloads } from "./AboutArchivePreview";
import {
  AboutCommunitySection,
  GROUP_LABEL_CLASSNAME,
} from "./AboutCommunitySection";

const DEFAULT_TAGLINE = SITE_FLAVOR_CONFIG.description;
const ABOUT_CONFIG = SITE_FLAVOR_CONFIG.about;

/**
 * Column count follows the card count so neither flavor strands a card on a row of its own:
 * dose.wiki ships three documentation cards, Effect Index four licensing/contact ones.
 */
const DOC_GRID_COLUMNS =
  ABOUT_CONFIG.docLinks.length % 2 === 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3";

/** Eyebrow above the pinned founder card. */
const FOUNDER_GROUP_LABEL = msg("Founder");

/** Eyebrow above the pinned staff grid. */
const STAFF_GROUP_LABEL = msg("Staff");

/** Eyebrow above the ranked contributor grid. */
const CONTRIBUTORS_GROUP_LABEL = msg("Contributors");

// The shared eyebrow class lives beside the community tiers that also use it.

function rosterCardHref(entry: ContributorRosterEntry): string {
  return publicHref.contributor(entry.profile.key);
}

/**
 * Effect Index's roster panel: the founder in her own labelled region, then the pinned staff
 * tier, then everybody else in a directory grid ordered by page credits.
 *
 * The founder and staff are separate regions rather than leading grid cells on purpose: a
 * reader has to be able to see *why* they come first, and the positions must not depend on
 * them out-ranking everyone on reference count.
 */
function ContributorRosterPanel({ roster }: { roster: ContributorRoster }) {
  const { founder, staff, contributors } = roster;

  return (
    <div className="space-y-8">
      <p className="theme-text-faint text-sm leading-6">{t(CONTRIBUTOR_ROSTER_ORDER_NOTE)}</p>

      {founder ? (
        <div className="space-y-3">
          <p className={GROUP_LABEL_CLASSNAME}>{t(FOUNDER_GROUP_LABEL)}</p>
          <ContributorCard
            contributor={{
              ...founder.profile,
              subtitle: formatContributorRosterSubtitle(founder, {
                roleFallback: t(EFFECT_INDEX_FOUNDER_ROLE_FALLBACK),
              }),
            }}
            href={rosterCardHref(founder)}
            className="sm:max-w-lg"
          />
        </div>
      ) : null}

      {staff.length > 0 ? (
        <div className="space-y-3">
          <p className={GROUP_LABEL_CLASSNAME}>{t(STAFF_GROUP_LABEL)}</p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {staff.map((entry) => (
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

      {contributors.length > 0 ? (
        <div className="space-y-3">
          <p className={GROUP_LABEL_CLASSNAME}>
            {t(CONTRIBUTORS_GROUP_LABEL)} · {contributors.length}
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
   * by page credits. Absent on a flavor that keeps the curated founder list.
   */
  contributorRoster?: ContributorRoster | null;
  /** Heading and table-of-contents label for the contributor section. Flavored with the content. */
  contributorsSectionTitle?: string;
  previewSnapshots: AboutPreviewSnapshot[];
  missionContent?: ReactNode;
  sourcesContent?: ReactNode;
  historyContent?: ReactNode;
  reuseContent?: ReactNode;
  /** Intro sentence above the Partners & Community roster. dose.wiki only; a Copy Studio slot. */
  communityIntro?: ReactNode;
  docBlurbs?: string[];
  docCopyControl?: ReactNode;
  /** Editor-managed tagline from Postgres siteConfig; falls back to the canonical line. */
  subtitle?: string;
  subtitleControl?: ReactNode;
  downloads: AboutDownloads;
}

export const AboutPage = memo(function AboutPage({
  founderProfiles,
  contributorRoster = null,
  contributorsSectionTitle = CURATED_FOUNDERS_SECTION_TITLE,
  previewSnapshots,
  missionContent,
  sourcesContent,
  historyContent,
  reuseContent,
  communityIntro,
  docBlurbs,
  docCopyControl,
  subtitle,
  subtitleControl,
  downloads,
}: AboutPageProps) {
  const founders = founderProfiles;
  const effectIndex = isEffectIndex();
  const introductionTitle = effectIndex ? t("Mission") : t("Introduction");
  const downloadsTitle = effectIndex ? t("Downloads") : t("Downloads & reuse");
  const showSources = !effectIndex && Boolean(sourcesContent);
  const hasRosterEntries =
    contributorRoster !== null &&
    (contributorRoster.founder !== null ||
      contributorRoster.staff.length > 0 ||
      contributorRoster.contributors.length > 0);

  const contributorsSection = (
    <section id="contributors" className="scroll-mt-24 space-y-6">
      <PublicSectionHeading icon="lucide:users" title={t(contributorsSectionTitle)} />

      {!effectIndex && historyContent ? (
        <div className="space-y-4">
          <h3 className="theme-text-primary text-lg font-semibold">{t("Project history")}</h3>
          {historyContent}
        </div>
      ) : null}

      {hasRosterEntries && contributorRoster ? (
        <ContributorRosterPanel roster={contributorRoster} />
      ) : founders.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {founders.map((profile) => (
            <li key={profile.key}>
              <ContributorCard
                contributor={{ ...profile, subtitle: profile.role ? t(profile.role) : undefined }}
                href={publicHref.contributor(profile.key)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-8 text-center">
          <p className="theme-text-faint text-sm">
            {t("Contributor profiles are on their way. Check back soon.")}
          </p>
        </div>
      )}

      {/* Infrastructure credit. For now this is the only surface that renders it;
          it renders nothing on a flavor that declares no supporter. */}
      <div className="flex justify-center pt-2">
        <SiteSupporter align="center" markHeightRem={2.25} />
      </div>
    </section>
  );
  const contributorsTocItem: PublicTableOfContentsItem = {
    id: "contributors",
    label: t(contributorsSectionTitle),
    icon: "lucide:users",
  };

  // One anchor per rendered section, in page order. The ids are the old tab
  // hash ids (`#data` is linked from the About markdown itself), so deep links
  const tocItems: PublicTableOfContentsItem[] = [
    { id: "mission", label: introductionTitle, icon: "lucide:compass" },
    ...(showSources
      ? [{
          id: "sources",
          label: t("Sources and review"),
          icon: "lucide:book-open",
        } satisfies PublicTableOfContentsItem]
      : []),
    ...(!effectIndex ? [contributorsTocItem] : []),
    { id: "docs", label: t(ABOUT_CONFIG.docsTitle), icon: "lucide:book-open" },
    ...(ABOUT_CONFIG.showOpenData
      ? [{ id: "data", label: downloadsTitle, icon: "lucide:download" } satisfies PublicTableOfContentsItem]
      : []),
    ...(effectIndex ? [contributorsTocItem] : []),
    ...(ABOUT_CONFIG.showCommunity
      ? [
          {
            id: "community",
            label: t("Partners & Community"),
            icon: "lucide:handshake",
          } satisfies PublicTableOfContentsItem,
        ]
      : []),
    ...(ABOUT_CONFIG.contact
      ? [
          {
            id: "contact",
            label: t("Contact & Feedback"),
            icon: "lucide:mail",
          } satisfies PublicTableOfContentsItem,
        ]
      : []),
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
        <div className="relative flex flex-col gap-6 pt-6 sm:pt-8">
          <div className="relative flex flex-col gap-6">
            {/* Title with icon */}
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:flex-wrap sm:justify-start sm:gap-6 sm:text-left">
              <span className="theme-home-logo-frame inline-flex items-center justify-center">
                <DoseWikiLogo
                  alt={SITE_FLAVOR_CONFIG.logo.heroAlt}
                  width={96}
                  height={96}
                  className="theme-home-logo h-44 w-44 sm:h-24 sm:w-24"
                  draggable={false}
                />
              </span>
              <div>
                <h1 className="theme-text-primary font-display relative break-words text-[2.5rem] font-bold leading-tight tracking-tight sm:text-[3.2rem]">
                  {/* "About " plus the wordmark's lead run stay in the primary text
                      color; only the accent run (".wiki" / "Index") takes the accent,
                      the same split as the homepage hero. Rejoins to aboutTitle. */}
                  {t("About")} <SiteWordmark />
                  {/* Superscript beta badge, mirroring the homepage wordmark: absolutely
                      positioned so the heading's layout never shifts when a flavor has
                      no badge (Effect Index renders nothing here). */}
                  <span className="absolute top-[0.06em] ml-[0.3em] inline-flex whitespace-nowrap">
                    <SiteVersionBadge variant="hero" />
                  </span>
                </h1>
                <p className="theme-text-faint mt-2 text-lg font-medium">
                  {subtitle?.trim() || DEFAULT_TAGLINE}
                </p>
                {subtitleControl}
              </div>
            </div>
          </div>
        </div>

        <section id="mission" className="scroll-mt-24">
          {/* The mission prose flows straight from the hero subtitle; keep an
              sr-only h2 so the landmark keeps its accessible name and the
              heading outline has no gap. No `space-y` here: the sr-only h2 is
              still a flow child, so it would push a full gap onto the prose. */}
          <h2 className="sr-only">{introductionTitle}</h2>

          <div>{missionContent}</div>

        </section>

        {showSources ? (
          <section id="sources" className="scroll-mt-24 space-y-6">
            <PublicSectionHeading icon="lucide:book-open" title={t("Sources and review")} />
            {sourcesContent}
          </section>
        ) : null}

        {!effectIndex ? contributorsSection : null}

        <section id="docs" className="scroll-mt-24 space-y-6">
          <PublicSectionHeading icon="lucide:book-open" title={t(ABOUT_CONFIG.docsTitle)} />

          {/* Without the Open Data section this is the only place the reuse terms
              appear, and it is where they belong: alongside the licence card. */}
          {ABOUT_CONFIG.showOpenData ? null : (reuseContent ?? (
            <SiteLicenceNotice className="theme-text-faint text-sm leading-6" notice={ABOUT_CONFIG.reuseNotice} />
          ))}

          <ul className={cn("grid gap-4", DOC_GRID_COLUMNS)}>
            {ABOUT_CONFIG.docLinks.map((doc, index) => (
              <li key={doc.href}>
                <InteractiveContentCard
                  asChild
                  padding="md"
                  className="group flex h-full flex-col gap-2"
                >
                  <Link href={doc.href} scroll={false}>
                    <span className="theme-accent-heading flex items-center gap-2 font-medium">
                      <Icon icon={doc.icon} size={18} />
                      {t(doc.title)}
                    </span>
                    <span className="theme-text-faint text-sm leading-6">{t(docBlurbs?.[index] ?? doc.description)}</span>
                  </Link>
                </InteractiveContentCard>
              </li>
            ))}
          </ul>
          {docCopyControl}
        </section>

        {/* The section's exports are dose.wiki's own: the molecule pack, the
            dataset downloads and the dose.wiki repository. A flavor that
            does not ship them drops the section rather than advertising
            another publication's downloads under its own licence. */}
        {ABOUT_CONFIG.showOpenData ? (
          <section id="data" className="scroll-mt-24 space-y-6">
            <PublicSectionHeading icon="lucide:download" title={downloadsTitle} />

            <AboutArchivePreview
              previewSnapshots={previewSnapshots}
              downloads={downloads}
            />

            {/* Reuse terms follow the publication: dose.wiki's CC0/MIT dedication is
                not Effect Index's licence, so this sentence is flavored rather than
                written inline. */}
            {reuseContent ?? <SiteLicenceNotice className="theme-text-faint text-sm leading-6" notice={ABOUT_CONFIG.reuseNotice} />}
          </section>
        ) : null}

        {effectIndex ? contributorsSection : null}

        {/* Partners & Community: one compact roster of data partners and
            neighbouring communities. dose.wiki only; Effect Index never
            renders it (see `about.showCommunity`). */}
        {ABOUT_CONFIG.showCommunity ? (
          <section id="community" className="scroll-mt-24 space-y-6">
            <PublicSectionHeading icon="lucide:handshake" title={t("Partners & Community")} />
            {communityIntro}
            <AboutCommunitySection />
          </section>
        ) : null}

        {/* Contact & Feedback: the published inbox plus the general feedback form.
            Flavored via `about.contact`; Effect Index publishes no dose.wiki address
            and already cards its own /contact page in the docs grid. */}
        {ABOUT_CONFIG.contact ? (
          <section id="contact" className="scroll-mt-24 space-y-6">
            <PublicSectionHeading icon="lucide:mail" title={t("Contact & Feedback")} />

            <p className="theme-text-secondary max-w-[65ch] text-sm leading-6">
              {t(
                "Found an issue with one of our articles? You can suggest changes using the box on any article, or with our feedback form. We review these regularly, and will incorporate suggestions into articles and future dataset releases.",
              )}
            </p>

            <p className="theme-text-secondary max-w-[65ch] text-sm leading-6">
              {t(
                "To reach dose.wiki with questions, legal, media, takedown requests, collaboration, or any other needs, please use the form or write to {{email}}.",
                { email: "contact@dose.wiki" },
              )}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <IconPillLink
                icon="lucide:mail"
                label={ABOUT_CONFIG.contact.email}
                href={`mailto:${ABOUT_CONFIG.contact.email}`}
              />
              <Button asChild variant="glass" size="pill">
                <Link href={ABOUT_CONFIG.contact.feedbackHref}>
                  <Icon icon="lucide:message-circle" size={16} />
                  {t("Open the feedback form")}
                </Link>
              </Button>
            </div>
          </section>
        ) : null}
      </StickyTocLayout>
    </main>
  );
});
