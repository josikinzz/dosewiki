"use client";

import { useCallback, useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { Icon, type IconName } from "../common/Icon";
import { MoleculeImage } from "./MoleculeImage";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/utils/fileSize";
import { icons } from "@/utils/iconNames";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { getOpenDataDownloadStats, type OpenDataDownloadStats, type PublicDownloadStats } from "@/lib/openDataDownloadStats";
import { ABOUT_PREVIEW_LINE_LIMIT, type AboutPreviewSnapshot } from "./aboutArchiveSnapshot";

type AboutDownloadKey = "substances" | "effects" | "reports" | "molecules";

/**
 * `true` lists a live JSON download without constructing it for a caption.
 * Its measurements arrive only on download intent, from the saved response.
 * Committed files can supply their deployment-matched measurements directly.
 * Omitted keys are not listed.
 */
export type AboutDownloads = Partial<Record<AboutDownloadKey, PublicDownloadStats | true>>;

// Each download carries the icon its section uses in the site menu, so the list
// reads as "the same things you navigate to, as files".

const DOWNLOADS: ReadonlyArray<{
  key: AboutDownloadKey;
  filename: string;
  href: string;
  icon: IconName;
}> = [
  {
    key: "substances",
    filename: "SubstanceIndex.json",
    href: "/open-data/SubstanceIndex.json",
    icon: resolveRouteChromeIcon("substances"),
  },
  {
    key: "effects",
    filename: "EffectIndex.json",
    href: "/open-data/EffectIndex.json",
    icon: resolveRouteChromeIcon("effects"),
  },
  {
    key: "reports",
    filename: "TripReports.json",
    href: "/open-data/TripReports.json",
    icon: resolveRouteChromeIcon("reports"),
  },
  {
    key: "molecules",
    filename: "dosewiki-molecules.zip",
    href: "/dosewiki-molecules.zip",
    icon: icons.hexagon,
  },
];

/** A few representative structures shown under the molecule pack download. */
const MOLECULE_PREVIEW_SLUGS = ["lsd", "2c-b", "psilocin", "mdma", "ketamine", "caffeine"] as const;

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function DownloadPill({
  filename,
  stats,
  icon,
  href,
}: {
  filename: string;
  stats: PublicDownloadStats | true;
  icon: IconName;
  href: string;
}) {
  const t = useT();
  const [measuredStats, setMeasuredStats] = useState<PublicDownloadStats | OpenDataDownloadStats | null>(
    stats === true ? null : stats,
  );
  const [downloading, setDownloading] = useState(false);
  const [failed, setFailed] = useState(false);
  const entries = measuredStats ? t("{{count}} entries", { count: measuredStats.count.toLocaleString() }) : null;
  const size = measuredStats ? formatFileSize(measuredStats.bytes) : null;
  const revision = measuredStats && "revision" in measuredStats ? measuredStats.revision : undefined;

  const handleDownload = async () => {
    if (stats !== true) {
      triggerDownload(href, filename);
      return;
    }
    setDownloading(true);
    setFailed(false);
    setMeasuredStats(null);
    try {
      // No mount-time request: an ordinary page read never regenerates an export.
      // Read the caption and file from one response so an ISR revision change
      // cannot make the caption describe a different document from the download.
      const response = await fetch(href);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const metadata = getOpenDataDownloadStats(response.headers);
      const blob = await response.blob();
      setMeasuredStats(metadata?.bytes === blob.size ? metadata : null);
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, filename);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setMeasuredStats(null);
      setFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <Button
        onClick={handleDownload}
        disabled={downloading}
        aria-busy={downloading}
        aria-label={entries && size
          ? t("Download {{filename}}, {{entries}}, {{size}}", { filename, entries, size })
          : t("Download {{filename}}", { filename })}
        title={revision ? `SHA-256: ${revision}` : undefined}
        data-download-revision={revision}
        className="theme-control-pill theme-text-primary h-10 w-full justify-start gap-2.5 rounded-full pl-3.5 pr-4"
      >
        <Icon icon={icon} size={18} className="theme-accent-emphasis shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{filename}</span>
        {measuredStats ? (
          <span className="theme-text-faint flex shrink-0 flex-col items-end text-[0.6875rem] font-medium leading-[1.2] tabular-nums sm:flex-row sm:items-baseline sm:gap-1 sm:leading-normal">
            <span>{entries}</span>
            <span className="theme-text-ghost hidden sm:inline" aria-hidden="true">·</span>
            <span>{size}</span>
          </span>
        ) : null}
        <Icon icon="charm:download" size={14} className="theme-text-faint shrink-0" aria-hidden="true" />
      </Button>
      {failed ? <p role="status" className="theme-text-secondary mt-1 text-sm">{t("Download failed. Please try again.")}</p> : null}
    </div>
  );
}

export function JsonSyntaxHighlight({
  json,
  truncated,
  truncatedNote = `Showing the first ${ABOUT_PREVIEW_LINE_LIMIT.toLocaleString()} lines; download SubstanceIndex.json for the full record.`,
}: {
  json: string;
  truncated: boolean;
  /** Shown beneath a cut record. */
  truncatedNote?: string;
}) {
  const highlightedLines = useMemo(() => {
    // The server already enforces the line limit for truncated snapshots;
    // complete snapshots must render every line.
    const escaped = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const tokens: string[] = [];
    let i = 0;
    while (i < escaped.length) {
      if (escaped[i] === '"') {
        let end = i + 1;
        while (end < escaped.length && escaped[end] !== '"') {
          if (escaped[end] === "\\") end++;
          end++;
        }
        end++;
        const str = escaped.slice(i, end);
        let j = end;
        while (j < escaped.length && /\s/.test(escaped[j])) j++;
        const isKey = escaped[j] === ":";
        const cls = isKey ? "theme-json-preview-key" : "theme-json-preview-string";
        tokens.push(`<span class="${cls}">${str}</span>`);
        i = end;
      } else if (/[-\d]/.test(escaped[i]) && (i === 0 || /[\s,:[{]/.test(escaped[i - 1]))) {
        let end = i;
        if (escaped[end] === "-") end++;
        while (end < escaped.length && /[\d.]/.test(escaped[end])) end++;
        if (end > i && (i === 0 || escaped[i] !== "-" || end > i + 1)) {
          const num = escaped.slice(i, end);
          if (/^-?\d+\.?\d*$/.test(num)) {
            tokens.push(`<span class="theme-json-preview-number">${num}</span>`);
            i = end;
            continue;
          }
        }
        tokens.push(escaped[i]);
        i++;
      } else if (escaped.slice(i, i + 4) === "true") {
        tokens.push(`<span class="theme-json-preview-boolean">true</span>`);
        i += 4;
      } else if (escaped.slice(i, i + 5) === "false") {
        tokens.push(`<span class="theme-json-preview-boolean">false</span>`);
        i += 5;
      } else if (escaped.slice(i, i + 4) === "null") {
        tokens.push(`<span class="theme-json-preview-null">null</span>`);
        i += 4;
      } else {
        tokens.push(escaped[i]);
        i++;
      }
    }
    return tokens.join("").split("\n");
  }, [json]);

  return (
    <div className="theme-json-preview-text font-mono text-xs leading-relaxed">
      {highlightedLines.map((line, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[2.5rem_1fr] items-start gap-3"
        >
          <span className="theme-json-preview-line-number select-none pr-2 text-right tabular-nums">
            {idx + 1}
          </span>
          <span
            className="min-w-0 whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: line.length ? line : "&nbsp;" }}
          />
        </div>
      ))}
      {truncated ? (
        <div className="theme-json-preview-truncation mt-4 rounded-xl border px-4 py-3 font-sans text-xs font-medium">
          {truncatedNote}
        </div>
      ) : null}
    </div>
  );
}

export function AboutArchivePreview({
  previewSnapshots,
  downloads,
  showMoleculePreview,
}: {
  previewSnapshots: AboutPreviewSnapshot[];
  /** The files to list, in the fixed order of the site menu; omitted keys are not shown. */
  downloads: AboutDownloads;
  /** Show the molecule strip under the pills. Defaults to on when the pack is listed. */
  showMoleculePreview?: boolean;
}) {
  const t = useT();
  const visibleDownloads = DOWNLOADS.flatMap((download) => {
    const stats = downloads[download.key];
    return stats ? [{ ...download, stats }] : [];
  });
  const moleculeStripVisible = showMoleculePreview ?? downloads.molecules !== undefined;

  // Open on a whole record when one exists; large articles remain reachable via Shuffle.
  const [previewIndex, setPreviewIndex] = useState(() => {
    if (previewSnapshots.length === 0) return -1;
    const complete = previewSnapshots.findIndex((snapshot) => !snapshot.truncated);
    return complete >= 0 ? complete : 0;
  });
  const [hasCopied, setHasCopied] = useState(false);

  const handleShuffle = useCallback(() => {
    if (previewSnapshots.length === 0) return;
    if (previewSnapshots.length === 1) {
      setPreviewIndex(0);
      return;
    }

    let next = previewIndex;
    for (let i = 0; i < 6; i++) {
      const candidate = Math.floor(Math.random() * previewSnapshots.length);
      if (candidate !== previewIndex) {
        next = candidate;
        break;
      }
    }
    setPreviewIndex(next);
  }, [previewSnapshots.length, previewIndex]);

  const currentSnapshot = useMemo(() => {
    if (previewIndex < 0 || !previewSnapshots[previewIndex]) {
      return null;
    }
    return previewSnapshots[previewIndex];
  }, [previewSnapshots, previewIndex]);

  const previewJson = currentSnapshot?.json ?? JSON.stringify("No preview available.", null, 2);

  const handleCopyPreview = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(previewJson);
      setHasCopied(true);
      window.setTimeout(() => setHasCopied(false), 1400);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = previewJson;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
        setHasCopied(true);
        window.setTimeout(() => setHasCopied(false), 1400);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }, [previewJson]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2">
          {visibleDownloads.map((download) => (
            <DownloadPill
              key={download.filename}
              filename={download.filename}
              stats={download.stats}
              icon={download.icon}
              href={download.href}
            />
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 pt-1 text-sm">
            <a
              href="https://github.com/josikinzz/dosewiki"
              target="_blank"
              rel="noopener noreferrer"
              className="theme-text-secondary hover:theme-text-primary inline-flex items-center gap-1.5"
            >
              <Icon icon="lucide:github" size={14} className="shrink-0" />
              <span>{t("Source code on GitHub")}</span>
            </a>
            <a
              href="https://github.com/josikinzz/dosewiki/blob/main/docs/api.md"
              target="_blank"
              rel="noopener noreferrer"
              className="theme-text-secondary hover:theme-text-primary inline-flex items-center gap-1.5"
            >
              <Icon icon="lucide:braces" size={14} className="shrink-0" />
              <span>{t("Public API")}</span>
            </a>
          </div>
        </div>

        {moleculeStripVisible ? (
        <ul className="grid grid-cols-6 gap-1.5 px-2" aria-hidden="true">
          {MOLECULE_PREVIEW_SLUGS.map((slug) => (
            <li key={slug} className="flex items-center justify-center">
              <MoleculeImage
                src={`/api/molecules/${slug}`}
                alt=""
                width={40}
                height={40}
                loading="lazy"
                className="theme-molecule-image h-10 w-10 object-contain"
                draggable={false}
              />
            </li>
          ))}
        </ul>
        ) : null}
      </section>

      <div className="theme-card-surface theme-about-json-preview flex min-w-0 flex-col overflow-hidden rounded-2xl border">
        <div className="theme-about-json-preview-header flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <span className="theme-json-preview-muted min-w-0 text-xs font-medium leading-4">
            {t("Sample record · refreshed nightly from the live database")}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyPreview}
              className="theme-json-preview-action h-8 min-h-0 gap-1.5 rounded-lg px-2.5 text-xs hover:bg-transparent"
            >
              <Icon icon={hasCopied ? "lucide:check" : "lucide:copy"} size={12} />
              {hasCopied ? t("Copied") : t("Copy")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShuffle}
              className="theme-json-preview-action h-8 min-h-0 gap-1.5 rounded-lg px-2.5 text-xs hover:bg-transparent"
            >
              <Icon icon="lucide:dices" size={12} />
              {t("Shuffle")}
            </Button>
          </div>
        </div>
        <div className="theme-about-json-preview-body relative min-h-[20rem] flex-1 overflow-hidden">
          <div
            aria-hidden="true"
            className="theme-json-preview-ambient pointer-events-none absolute inset-0 opacity-[0.65]"
          />

          <div className="absolute inset-0 overflow-auto py-4 pl-3 pr-4 custom-scrollbar sm:pr-6">
            <JsonSyntaxHighlight json={previewJson} truncated={currentSnapshot?.truncated ?? false} />
          </div>
        </div>
      </div>
    </div>
  );
}
