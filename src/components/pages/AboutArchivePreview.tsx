"use client";

import { useCallback, useMemo, useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import { MoleculeImage } from "./MoleculeImage";
import { Button } from "@/components/ui/button";
import { icons } from "@/utils/iconNames";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { ABOUT_PREVIEW_LINE_LIMIT, type AboutPreviewSnapshot } from "./aboutArchiveSnapshot";

// Each download carries the icon its section uses in the site menu, so the list
// reads as "the same things you navigate to, as files".
/**
 * Record counts shown beside each download. Every value comes from the same Convex
 * reads the page already performs; nothing here is defaulted so the captions can
 * never drift from the published set.
 */
export type AboutDownloadCounts = {
  substances: number;
  effects: number;
  reports: number;
  molecules: number;
};

export type AboutDownloadKey = keyof AboutDownloadCounts;

const DOWNLOADS = [
  {
    key: "substances",
    filename: "SubstanceIndex.json",
    href: "/open-data/SubstanceIndex.json",
    noun: "substances",
    icon: resolveRouteChromeIcon("substances"),
  },
  {
    key: "effects",
    filename: "EffectIndex.json",
    href: "/open-data/EffectIndex.json",
    noun: "effects",
    icon: resolveRouteChromeIcon("effects"),
  },
  {
    key: "reports",
    filename: "TripReports.json",
    href: "/open-data/TripReports.json",
    noun: "reports",
    icon: resolveRouteChromeIcon("reports"),
  },
  {
    key: "molecules",
    filename: "dosewiki-molecules.zip",
    href: "/dosewiki-molecules.zip",
    noun: "SVGs",
    icon: icons.hexagon,
  },
] as const satisfies ReadonlyArray<{ key: keyof AboutDownloadCounts } & Record<string, unknown>>;

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
  caption,
  icon,
  onClick,
}: {
  filename: string;
  caption: string;
  icon: IconName;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      aria-label={`Download ${filename}`}
      className="theme-control-pill theme-text-primary h-10 w-full justify-start gap-2.5 rounded-full pl-3.5 pr-4"
    >
      <Icon icon={icon} size={18} className="theme-accent-emphasis shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{filename}</span>
      <span className="theme-text-faint shrink-0 text-xs">{caption}</span>
      <Icon icon="charm:download" size={14} className="theme-text-faint shrink-0" aria-hidden="true" />
    </Button>
  );
}

function JsonSyntaxHighlight({ json, truncated }: { json: string; truncated: boolean }) {
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
          Showing the first {ABOUT_PREVIEW_LINE_LIMIT.toLocaleString()} lines; download SubstanceIndex.json for the full record.
        </div>
      ) : null}
    </div>
  );
}

export function AboutArchivePreview({
  previewSnapshots,
  downloadCounts,
  downloads,
  showMoleculePreview,
}: {
  previewSnapshots: AboutPreviewSnapshot[];
  /** Counts for the downloads listed in `downloads`; the rest may be omitted. */
  downloadCounts: Partial<AboutDownloadCounts>;
  /** Which files to list. Defaults to every download the About page offers. */
  downloads?: ReadonlyArray<AboutDownloadKey>;
  /** Show the molecule strip under the pills. Defaults to on when the pack is listed. */
  showMoleculePreview?: boolean;
}) {
  const visibleDownloads = DOWNLOADS.filter(
    (download) => downloads === undefined || downloads.includes(download.key),
  );
  const moleculeStripVisible =
    showMoleculePreview ?? visibleDownloads.some((download) => download.key === "molecules");

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
              caption={`${(downloadCounts[download.key] ?? 0).toLocaleString()} ${download.noun}`}
              icon={download.icon}
              onClick={() => triggerDownload(download.href, download.filename)}
            />
          ))}
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
            Sample record · refreshed nightly from the live database
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyPreview}
              className="theme-json-preview-action h-8 min-h-0 gap-1.5 rounded-lg px-2.5 text-xs hover:bg-transparent"
            >
              <Icon icon={hasCopied ? "lucide:check" : "lucide:copy"} size={12} />
              {hasCopied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShuffle}
              className="theme-json-preview-action h-8 min-h-0 gap-1.5 rounded-lg px-2.5 text-xs hover:bg-transparent"
            >
              <Icon icon="lucide:dices" size={12} />
              Shuffle
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
