"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { Button } from "@/components/ui/button";
import { CountUp } from "./ChinaDelight";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatFileSize } from "@/utils/fileSize";
import type { TranslationPack, TranslationPackFile, TranslationPackIndex, TranslationSamplePair } from "@server/next/translationPacks";
import { TranslationSampleCompare } from "./TranslationSampleCompare";

export type PackFormat = "json" | "markdown";

const FORMAT_PARAM = "format";
const FREEODWIKI_SITE = "https://freeodwiki.org/";

const FORMATS: { value: PackFormat; zh: string; en: string; icon: IconName }[] = [
  { value: "markdown", zh: "Markdown 页面", en: "Markdown pages", icon: "lucide:file-text" },
  { value: "json", zh: "JSON 数据", en: "JSON data", icon: "lucide:file-json" },
];

/**
 * One segment of the format switch. The group is the housing; a segment has
 * no border of its own, and the chosen one takes the accent CTA fill so the
 * pair reads as a switch rather than two buttons.
 */
const SEGMENT_CLASS =
  "theme-china-segment h-auto rounded-full border-0 px-4 py-2 data-[state=on]:shadow-none";

/**
 * One icon per dataset. The three indexes reuse the icons the site's own
 * navigation shows for them, so a reader who has used dose.wiki recognises
 * them; the rest are Lucide picks for what the pack is.
 */
const DATASET_ICONS: Record<string, IconName> = {
  substances: resolveRouteChromeIcon("substances"),
  effects: resolveRouteChromeIcon("effects"),
  reports: resolveRouteChromeIcon("reports"),
  articles: "lucide:book-open-text",
  layout: "lucide:layout-list",
  copy: "lucide:text-quote",
};
const FORMAT_STORAGE = "dosewiki.china.format";

function isFormat(value: string | null): value is PackFormat {
  return value === "json" || value === "markdown";
}

/** An outbound link in the prose treatment, with the external mark the Markdown renderer uses. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${proseLinkClassName} inline-flex items-center gap-0.5`}>
      {children}
      <Icon icon="lucide:external-link" size={12} className="opacity-60" aria-hidden="true" />
    </a>
  );
}

/** Chinese first, English beneath, for one title or one line of description. */
export function Bilingual({ zh, en, as: Tag, className }: { zh: ReactNode; en: ReactNode; as: "h2" | "p"; className: string }) {
  return (
    <Tag className={className}>
      <span lang="zh-Hans" className="block">
        {zh}
      </span>
      <span lang="en" className="theme-text-secondary block font-normal">
        {en}
      </span>
    </Tag>
  );
}

/** One file: a labelled download button with the count and size beneath it. */
function PackDownload({ label, lang, file, noun }: { label: string; lang: string; file: TranslationPackFile; noun: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Button asChild variant="default" size="lg" className="justify-start">
        <a href={file.href} download={file.file} lang={lang}>
          <Icon icon="charm:download" size={18} aria-hidden="true" />
          {label}
        </a>
      </Button>
      <p className="theme-text-faint text-xs">
        <CountUp value={file.items} /> {noun} · {formatFileSize(file.bytes)}
      </p>
    </div>
  );
}

function DatasetSection({
  pack,
  format,
  locale,
  samples,
}: {
  pack: TranslationPack;
  format: PackFormat;
  locale: string;
  samples: TranslationSamplePair[];
}) {
  const unavailable = format === "markdown" && !pack.markdown;
  return (
    <section aria-label={pack.title} className={`space-y-5 ${unavailable ? "opacity-50" : ""}`}>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          {DATASET_ICONS[pack.id] ? (
            <Icon icon={DATASET_ICONS[pack.id]} size={40} className="theme-accent-heading shrink-0" aria-hidden="true" />
          ) : null}
          <Bilingual as="h2" zh={pack.titleZh} en={pack.title} className="theme-accent-heading font-display text-2xl font-semibold leading-tight" />
        </div>
        <Bilingual as="p" zh={pack.summaryZh} en={pack.summary} className="theme-text-secondary max-w-[68ch] text-sm leading-6" />
      </div>
      {format === "json" ? (
        <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
          <PackDownload label="简体中文" lang={locale} file={pack.translated} noun={pack.nounZh} />
          <PackDownload label="English" lang="en" file={pack.source} noun={pack.noun} />
        </div>
      ) : pack.markdown ? (
        <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
          <PackDownload label="简体中文" lang={locale} file={pack.markdown.translated} noun="页" />
          <PackDownload label="English" lang="en" file={pack.markdown.source} noun="pages" />
        </div>
      ) : (
        <p className="theme-text-faint text-sm">
          <span lang="zh-Hans">此数据集没有页面形式，仅提供 JSON。</span> No page form; JSON only.
        </p>
      )}
      {samples.length > 0 && !unavailable ? (
        <TranslationSampleCompare
          pairs={samples}
          format={format}
          locale={locale}
          translatedLabel={`${pack.titleZh} 样例`}
          sourceLabel={`${pack.title} sample`}
        />
      ) : null}
    </section>
  );
}

/**
 * The datasets under one format toggle. JSON is the pair of files a reader
 * compares; Markdown is the FreeODwiki-shaped tree a maintainer copies in.
 * The choice lives in the URL so a link opens on the right tab, and is
 * remembered for the next visit.
 */
export function DownloadsCatalogue({
  translations,
  samples,
}: {
  translations: TranslationPackIndex;
  samples: Record<string, TranslationSamplePair[]>;
}) {
  const [format, setFormat] = useState<PackFormat>("markdown");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(FORMAT_PARAM);
    const fromStorage = window.localStorage.getItem(FORMAT_STORAGE);
    if (isFormat(fromUrl)) setFormat(fromUrl);
    else if (isFormat(fromStorage)) setFormat(fromStorage);
  }, []);

  const choose = (value: string) => {
    if (!isFormat(value)) return;
    setFormat(value);
    window.localStorage.setItem(FORMAT_STORAGE, value);
    const url = new URL(window.location.href);
    if (value === "markdown") url.searchParams.delete(FORMAT_PARAM);
    else url.searchParams.set(FORMAT_PARAM, value);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <ToggleGroup
          type="single"
          value={format}
          onValueChange={choose}
          aria-label="格式 · Format"
          className="theme-china-switch inline-flex justify-start gap-1 rounded-full border p-1"
        >
          {FORMATS.map(({ value, zh, en, icon }) => (
            <ToggleGroupItem key={value} value={value} className={SEGMENT_CLASS}>
              <Icon icon={icon} size={18} aria-hidden="true" />
              <span className="flex flex-col items-start gap-0 leading-tight">
                <span lang="zh-Hans">{zh}</span>
                <span className="text-xs font-normal opacity-80">{en}</span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {format === "markdown" && translations.markdownTree ? (
          <div className="space-y-3">
            <Bilingual
              as="p"
              zh={
                <>
                  按 <ExternalLink href={FREEODWIKI_SITE}>FreeODwiki</ExternalLink>（
                  <ExternalLink href={`https://${translations.markdownTree.target}`}>{translations.markdownTree.target}</ExternalLink>
                  ）的目录结构与链接写法生成的 Markdown 页面，可直接合并进该仓库。英文版结构相同，供对照。
                </>
              }
              en={
                <>
                  Markdown pages in the tree layout and link style of <ExternalLink href={FREEODWIKI_SITE}>FreeODwiki</ExternalLink> (
                  <ExternalLink href={`https://${translations.markdownTree.target}`}>{translations.markdownTree.target}</ExternalLink>
                  ), ready to merge into that repository. The English set has the same shape, for comparison.
                </>
              }
              className="theme-text-secondary max-w-[68ch] text-sm leading-6"
            />
            <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
              <PackDownload
                label="全部 · Everything"
                lang="zh-Hans"
                file={translations.markdownTree}
                noun="页 · pages"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-14">
        {translations.packs.map((pack) => (
          <DatasetSection key={pack.id} pack={pack} format={format} locale={translations.locale} samples={samples[pack.id] ?? []} />
        ))}
      </div>
    </div>
  );
}
