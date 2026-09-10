import { notFound } from "next/navigation";

import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getMoleculePackDownloadStats, getMoleculePackSlugs } from "@server/open-data/downloadStats";
import { getTranslationPacks, getTranslationSamples } from "@server/next/translationPacks";
import { Bilingual, DownloadsCatalogue, ExternalLink } from "./DownloadsCatalogue";
import { getCopy } from "@server/next/copyBlocks";
import { AppImage } from "@/components/common/AppImage";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { ConsoleGreeting, CountUp, MoleculeCarousel, Signature } from "./ChinaDelight";
import { Icon } from "@/components/common/Icon";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { formatFileSize } from "@/utils/fileSize";

export const revalidate = 3600;

/**
 * The bulk downloads are dose.wiki's own material. A flavor without the Open
 * Data section does not ship them and must not advertise another
 * publication's files under its own licence.
 */
const SHOWS_DOWNLOADS = SITE_FLAVOR_CONFIG.about.showOpenData;

/** Structures drawn beside the molecule pack, purely as decoration. */
/** How many drawings the carousel cycles through; a fresh draw every revalidation. */
const CAROUSEL_SIZE = 14;

/** The historical PsychonautWiki archive the author maintains; every mention points here. */
const PSYCHONAUTWIKI_ARCHIVE = "https://psychonautwiki.rip";

function drawMolecules(slugs: readonly string[], size: number): string[] {
  const pool = [...slugs];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

/**
 * Unlisted by design. The page is reachable at its address but carries
 * `noIndex`, is absent from `STATIC_PUBLIC_PATHS` so it never enters the
 * sitemap, and nothing links to it. It is also absent from
 * `noIndexRoutePolicies`, because that list writes a robots.txt `Disallow:`
 * line, which would publish the address it is meant to keep quiet.
 */
export async function generateMetadata() {
  if (!SHOWS_DOWNLOADS) {
    notFound();
  }

  return buildPublicPageMetadata({
    title: "dose.wiki 中文",
    description: "The dose.wiki datasets, each in Simplified Chinese and in English, as JSON and as FreeODwiki Markdown.",
    pathname: "/china",
    noIndex: true,
  });
}

export default async function DownloadsPage() {
  if (!SHOWS_DOWNLOADS) {
    notFound();
  }

  const copy = await getCopy();
  const statementDate = new Date("2026-09-09T12:00:00Z");
  const translations = getTranslationPacks();
  const samples = getTranslationSamples();
  const molecules = getMoleculePackDownloadStats();
  const carousel = drawMolecules(getMoleculePackSlugs(), CAROUSEL_SIZE);

  return (
    <PublicContentShell focusTarget width="wide" className="space-y-16">
      {/* The banner is the title: a dose.wiki molecule arm and a FreeODwiki pill arm, US and Chinese flags, gripping. */}
      <AppImage
        src="/images/downloads/dosewiki-freeodwiki-banner.webp"
        alt="dose.wiki 与 FreeODwiki · dose.wiki and FreeODwiki"
        width={1608}
        height={618}
        priority
        unoptimized
        sizes="(min-width: 1024px) 60vw, 100vw"
        className="theme-cutout-glow theme-china-banner mx-auto h-auto w-full lg:w-2/3"
      />

      <ConsoleGreeting />
      {translations && <DownloadsCatalogue translations={translations} samples={samples?.samples ?? {}} />}

      <section aria-label="Molecule drawings" className="space-y-2">
        <MoleculeCarousel slugs={carousel} />
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Icon icon="lucide:hexagon" size={40} className="theme-accent-heading shrink-0" aria-hidden="true" />
            <Bilingual
              as="h2"
              zh="分子结构图"
              en="Molecule drawings"
              className="theme-accent-heading font-display text-2xl font-semibold leading-tight"
            />
          </div>
          <Bilingual
            as="p"
            zh="每种物质一张结构图，SVG 格式，含浅色、深色和教科书标准三种配色。没有需要翻译的文字。"
            en="One structure drawing per substance, as SVG, in light-mode, dark-mode and textbook colourways. No text to translate."
            className="theme-text-secondary max-w-[68ch] text-sm leading-6"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild variant="default" size="lg" className="justify-start self-start">
            <a href="/dosewiki-molecules.zip" download="dosewiki-molecules.zip">
              <Icon icon="charm:download" size={18} aria-hidden="true" />
              SVG
            </a>
          </Button>
          <p className="theme-text-faint text-xs">
            <CountUp value={molecules.count} /> 张 · <CountUp value={molecules.count} /> drawings ·{" "}
            {formatFileSize(molecules.bytes)}
          </p>
        </div>
      </section>

      {/* Josie's statement to FreeODwiki: Chinese left, English right, the author between them. */}
      <section aria-label="Josie Kins 致 FreeODwiki · A statement from Josie Kins" className="border-dose-divider space-y-8 border-t pt-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-12">
          <PublicMarkdownBody
            content={copy.text("china-statement-zh")}
            className="max-w-none"
          />
          <div className="flex flex-col items-center gap-3 text-center lg:sticky lg:top-24 lg:self-start">
            <AppImage
              src="/profile-avatars/josie/avatar.webp"
              alt=""
              width={96}
              height={96}
              unoptimized
              className="h-24 w-24 rounded-full"
            />
            <Signature watch="china-statement-end" />
            <p className="theme-text-secondary text-xs leading-5">
              <span lang="zh-Hans">
                dose.wiki 与 <ExternalLink href={PSYCHONAUTWIKI_ARCHIVE}>PsychonautWiki</ExternalLink> 创始人
              </span>
              <br />
              Founder of dose.wiki and <ExternalLink href={PSYCHONAUTWIKI_ARCHIVE}>PsychonautWiki</ExternalLink>
              <br />
              <time dateTime={statementDate.toISOString().slice(0, 10)}>
                {statementDate.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })} ·{" "}
                {statementDate.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
              </time>
            </p>
          </div>
          <div>
            <PublicMarkdownBody content={copy.text("china-statement-en")} className="max-w-none" />
            {/* Reaching this marks the statement as read; the signature answers. */}
            <div id="china-statement-end" aria-hidden="true" className="h-px" />
          </div>
        </div>
      </section>
    </PublicContentShell>
  );
}
