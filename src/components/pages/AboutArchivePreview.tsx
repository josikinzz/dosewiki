"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Icon } from "../common/Icon";
import { Button } from "@/components/ui/button";
import { ABOUT_PREVIEW_LINE_LIMIT, type AboutPreviewSnapshot } from "./aboutArchiveSnapshot";

const DATASET_DOWNLOADS = [
  {
    filename: "SubstanceIndex.json",
    href: "/open-data/SubstanceIndex.json",
    caption: "every substance",
  },
  {
    filename: "EffectIndex.json",
    href: "/open-data/EffectIndex.json",
    caption: "every subjective effect",
  },
  {
    filename: "TripReports.json",
    href: "/open-data/TripReports.json",
    caption: "every published report",
  },
] as const;

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
  aside,
}: {
  previewSnapshots: AboutPreviewSnapshot[];
  /** Rendered in the left column under the dataset downloads (e.g. the molecule pack). */
  aside?: ReactNode;
}) {
  // Open on a whole record when one exists; large articles remain reachable via Shuffle.
  const [previewIndex, setPreviewIndex] = useState(() => {
    if (previewSnapshots.length === 0) return -1;
    const complete = previewSnapshots.findIndex((snapshot) => !snapshot.truncated);
    return complete >= 0 ? complete : 0;
  });
  const [hasCopied, setHasCopied] = useState(false);

  const handleDownload = useCallback((href: string, filename: string) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

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
          {DATASET_DOWNLOADS.map((dataset) => (
            <Button
              key={dataset.filename}
              onClick={() => handleDownload(dataset.href, dataset.filename)}
              className="theme-control-pill theme-text-primary h-10 w-full justify-start gap-2.5 rounded-full px-4"
            >
              <Icon
                icon="lucide:download"
                size={16}
                className="theme-accent-emphasis shrink-0"
              />
              <span className="min-w-0 truncate text-sm">
                <span className="font-semibold text-dose-accent-strong">{dataset.filename}</span>
                <span className="theme-text-faint text-xs"> · {dataset.caption}</span>
              </span>
            </Button>
          ))}
          <p className="theme-text-faint px-1 text-xs leading-5">
            JSON, refreshed nightly from the live database. Reuse terms vary by dataset;
            see{" "}
            <Link href="/docs/license" className="theme-link-muted transition-colors">
              License &amp; reuse
            </Link>
            .
          </p>
        </div>
        {aside}
      </section>

      <div className="theme-card-surface theme-about-json-preview flex min-w-0 flex-col overflow-hidden rounded-2xl border">
        <div className="theme-about-json-preview-header flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex gap-1.5">
              <div className="theme-json-preview-window-dot h-2.5 w-2.5 rounded-full" data-tone="danger" />
              <div className="theme-json-preview-window-dot h-2.5 w-2.5 rounded-full" data-tone="warning" />
              <div className="theme-json-preview-window-dot h-2.5 w-2.5 rounded-full" data-tone="success" />
            </div>
            <span className="theme-json-preview-muted ml-2 min-w-0 text-xs font-medium leading-4">Archival SubstanceIndex.json preview</span>
          </div>
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
          <div
            aria-hidden="true"
            className="theme-json-preview-scanlines pointer-events-none absolute inset-0"
          />

          <div className="absolute inset-0 overflow-auto py-4 pl-3 pr-4 custom-scrollbar sm:pr-6">
            <JsonSyntaxHighlight json={previewJson} truncated={currentSnapshot?.truncated ?? false} />
          </div>
        </div>
      </div>
    </div>
  );
}
