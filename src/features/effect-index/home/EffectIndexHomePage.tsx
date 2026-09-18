import Link from "next/link";
import { SmartLink } from "@/components/common/SmartLink";

import { AppImage } from "@/components/common/AppImage";
import {
  PSYCHOACTIVE_SUMMARY_DEFINITIONS,
  type PsychoactiveSummaryRouteKey,
} from "@/features/psychoactive-summaries/summaryDefinitions";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import { icons } from "@/utils/iconNames";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { FeaturedReplicationsPanel } from "./FeaturedReplicationsPanel";
import { HomeIntro } from "./HomeIntro";
import { MailingListPanel } from "./MailingListPanel";
import {
  effectIndexHomePanelBlurb,
  type EffectIndexHomeCopy,
} from "./homeIntroCopy";
import {
  HomePanel,
  HomePanelGroupLabel,
  homePanelLinkClassName,
  homePanelRowClassName,
} from "./HomePanel";
import type { EffectIndexHomeData } from "./homeModel";
import { t } from "@/i18n/server";

/**
 * The Effect Index homepage: the intro block, then two columns of content panels, in the
 * order the original site's `pages/index.vue` declared them.
 *
 * Two pieces of the original are deliberately out of scope. `FrontpageArticle` rendered at
 * most one article flagged `frontpage`, and no record in the legacy dump carries that flag;
 * the data-warning strip above the columns was a Nuxt prefetch artefact with no analogue in
 * this codebase's read layer.
 *
 * The original also carried a search box inside this intro block. This build's site header
 * already puts the global search on every page including the homepage — the original's
 * header had none, which is why its homepage had to supply one — so a second field 60px
 * below the first would be duplication rather than parity.
 */

const SPONSOR_NAME = "Emergence Benefactors";
const SPONSOR_URL = "https://ebenefactors.org/";

const SUMMARY_PATHS = Object.fromEntries(
  PSYCHOACTIVE_SUMMARY_DEFINITIONS.map((definition) => [definition.key, definition.path]),
) as Record<PsychoactiveSummaryRouteKey, string>;

/**
 * The substance-summary list, exactly as the original grouped it: the three psychedelic
 * summaries share one row behind a plain-text "Psychedelics:" label, and the dissociative
 * and deliriant summaries take a row each. Paths come from each summary's own definition —
 * the old site's were `/summaries/psychedelics/*` and this codebase's are singular.
 */
const SUMMARY_ROWS: readonly {
  id: string;
  prefix?: string;
  links: readonly { label: string; key: PsychoactiveSummaryRouteKey }[];
}[] = [
  {
    id: "psychedelics",
    prefix: "Psychedelics:",
    links: [
      { label: "Visual,", key: "psychedelic-visual" },
      { label: "Cognitive,", key: "psychedelic-cognitive" },
      { label: "Miscellaneous", key: "psychedelic-miscellaneous" },
    ],
  },
  { id: "dissociatives", links: [{ label: "Dissociatives", key: "dissociative" }] },
  { id: "deliriants", links: [{ label: "Deliriants", key: "deliriant" }] },
];

function ArticlesSectionStub() {
  return (
    <>
      For more, see the{" "}
      <Link href="/articles" className={homePanelLinkClassName}>
        articles section.
      </Link>
    </>
  );
}

interface EffectIndexHomePageProps extends EffectIndexHomeData {
  /**
   * Editable homepage prose, resolved on the server. Omitted — as in the tests
   * and in an un-seeded deployment — every string falls back to the wording the
   * page shipped with.
   */
  copy?: EffectIndexHomeCopy;
}

export function EffectIndexHomePage({
  effectCount,
  effectGroups,
  featuredArticle,
  featuredReports,
  featuredReplications,
  copy,
}: EffectIndexHomePageProps) {
  const blurb = (slot: Parameters<typeof effectIndexHomePanelBlurb>[0]) =>
    effectIndexHomePanelBlurb(slot, copy?.panelBlurbs);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 focus:outline-none md:px-8"
    >
      {/* The original front page carried no visible page title — it opened straight into the
          intro paragraph, and its panel titles were the h1s. Six h1s is not a heading
          outline, so the panels are h2s and the document's one h1 names the publication for
          assistive technology and for search without putting a title back on the design. */}
      <h1 className="sr-only">Effect Index</h1>

      <HomeIntro effectCount={effectCount} copy={copy?.intro} />

      {/* The original collapsed its two columns at 800px; this keeps that breakpoint
          rather than rounding it to the nearest Tailwind stop. */}
      <div className="mt-8 grid grid-cols-1 items-start gap-4 min-[800px]:grid-cols-2">
        <div className="flex flex-col gap-4">
          <HomePanel
            title={`Thank you ${SPONSOR_NAME}!`}
            icon={icons.heart}
            contentClassName="flex items-center justify-center p-4"
            stub={
              <>
                Thank you to our wonderful sponsor,{" "}
                <a
                  href={SPONSOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={homePanelLinkClassName}
                >
                  {SPONSOR_NAME}
                </a>
              </>
            }
          >
            <a href={SPONSOR_URL} target="_blank" rel="noopener noreferrer">
              <AppImage
                src="/effectindex/ebenefactors.png"
                alt={`${SPONSOR_NAME} logo`}
                width={300}
                height={284}
                sizes="(max-width: 800px) 18rem, 20rem"
                className="h-auto w-full max-w-[18rem]"
              />
            </a>
          </HomePanel>

          <MailingListPanel />

          <HomePanel
            title="Substance Summaries"
            description={blurb("substanceSummaries")}
            icon={resolveRouteChromeIcon("substances")}
            stub={<ArticlesSectionStub />}
          >
            <ul className="theme-text-secondary ml-5 list-disc space-y-2 text-[1.0625rem] marker:text-dose-text-ghost">
              {SUMMARY_ROWS.map((row) => (
                <li key={row.id}>
                  {row.prefix ? <span className="theme-text-primary">{row.prefix} </span> : null}
                  {row.links.map((link, position) => (
                    <span key={link.key}>
                      {position > 0 ? " " : null}
                      <Link href={SUMMARY_PATHS[link.key]} className={homePanelLinkClassName}>
                        {link.label}
                      </Link>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </HomePanel>

          {effectGroups.length > 0 ? (
            <HomePanel
              title="Featured Effects"
              description={blurb("featuredEffects")}
              icon={icons.eye}
              contentClassName=""
              stub={
                <>
                  For more, see the{" "}
                  <Link href="/effects" className={homePanelLinkClassName}>
                    Subjective Effect Index.
                  </Link>
                </>
              }
            >
              {effectGroups.map((group) => (
                <div
                  key={group.id}
                  className="border-b border-dose-border px-3 py-3 last:border-b-0"
                >
                  <HomePanelGroupLabel>{group.label}</HomePanelGroupLabel>
                  <p className="mt-2 text-[1.0625rem] leading-7">
                    {group.effects.map((effect, position) => (
                      <span key={effect.slug}>
                        {position > 0 ? (
                          <span className="text-dose-text-ghost" aria-hidden="true">
                            {" · "}
                          </span>
                        ) : null}
                        <SmartLink
                          href={getPublicRoutePath({
                            family: "effect",
                            params: { effectSlug: effect.slug },
                          })}
                          className={homePanelLinkClassName}
                        >
                          {effect.name}
                        </SmartLink>
                      </span>
                    ))}
                  </p>
                </div>
              ))}
            </HomePanel>
          ) : null}

          {featuredArticle ? (
            <HomePanel
              title={t("Featured Article")}
              description={blurb("featuredArticle")}
              icon={icons.fileText}
              contentClassName=""
              stub={<ArticlesSectionStub />}
            >
              <div className={homePanelRowClassName}>
                <p className="text-[1.0625rem] leading-snug">
                  <Link
                    href={getPublicRoutePath({
                      family: "article",
                      params: { slug: featuredArticle.slug },
                    })}
                    className={homePanelLinkClassName}
                  >
                    {featuredArticle.title}
                  </Link>
                </p>
                {featuredArticle.authorLine ? (
                  <p className="theme-text-secondary mt-0.5 text-[0.9375rem] italic">
                    {t("by")} {featuredArticle.authorLine}
                  </p>
                ) : null}
                {featuredArticle.dateLabel || featuredArticle.readTimeLabel ? (
                  <p className="text-dose-text-ghost mt-1 text-[0.9375rem]">
                    {[featuredArticle.dateLabel, featuredArticle.readTimeLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {featuredArticle.description ? (
                  <p className="theme-text-muted mt-3 text-[1rem] italic leading-7">
                    {featuredArticle.description}
                  </p>
                ) : null}
              </div>
            </HomePanel>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <FeaturedReplicationsPanel
            items={featuredReplications}
            description={blurb("featuredReplications")}
            stub={
              <>
                For more, see the{" "}
                <Link href="/replications" className={homePanelLinkClassName}>
                  replications gallery.
                </Link>
              </>
            }
          />

          {featuredReports.length > 0 ? (
            <HomePanel
              title="Featured Reports"
              description={blurb("featuredReports")}
              icon={resolveRouteChromeIcon("reports")}
              contentClassName=""
              stub={
                <>
                  For more, see the{" "}
                  <Link href="/reports" className={homePanelLinkClassName}>
                    reports section.
                  </Link>
                </>
              }
            >
              {featuredReports.map((report) => (
                <div
                  key={report.slug}
                  className={`${homePanelRowClassName} flex items-center gap-3`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[1.0625rem] leading-snug">
                      <SmartLink
                        href={getPublicRoutePath({
                          family: "report",
                          params: { slug: report.slug },
                        })}
                        className={homePanelLinkClassName}
                      >
                        {report.title}
                      </SmartLink>
                    </p>
                    <p className="theme-text-secondary mt-0.5 text-[0.9375rem] italic">
                      by {report.author}
                    </p>
                  </div>
                  {report.substanceName ? (
                    <div className="theme-text-muted min-w-0 flex-1 text-[0.9375rem] leading-snug">
                      <p>{report.substanceName}</p>
                      {report.doseLine ? <p className="mt-0.5">{report.doseLine}</p> : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </HomePanel>
          ) : null}
        </div>
      </div>
    </main>
  );
}
