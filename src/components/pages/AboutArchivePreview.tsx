"use client";

import { useCallback, useMemo, useState } from "react";
import { Icon } from "../common/Icon";
import { IconBadge } from "../common/IconBadge";
import { Button } from "@/components/ui/button";
import { IconPillLink } from "@/components/layout/PublicPagePrimitives";
import { ABOUT_PREVIEW_LINE_LIMIT, type AboutPreviewSnapshot } from "./aboutArchiveSnapshot";

const DATASET_DOWNLOADS = [
  {
    filename: "SubstanceIndex.json",
    href: "/open-data/SubstanceIndex.json",
    caption: "The complete Substance Index",
  },
  {
    filename: "EffectIndex.json",
    href: "/open-data/EffectIndex.json",
    caption: "The complete Subjective Effect Index",
  },
  {
    filename: "TripReports.json",
    href: "/open-data/TripReports.json",
    caption: "All published trip reports",
  },
] as const;

function JsonSyntaxHighlight({ json, truncated }: { json: string; truncated: boolean }) {
  const highlightedLines = useMemo(() => {
    const escaped = json
      .split("\n")
      .slice(0, ABOUT_PREVIEW_LINE_LIMIT)
      .join("\n")
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
          Showing the first {ABOUT_PREVIEW_LINE_LIMIT.toLocaleString()} lines. Download the full SubstanceIndex.json snapshot below.
        </div>
      ) : null}
    </div>
  );
}

export function AboutArchivePreview({ previewSnapshots }: { previewSnapshots: AboutPreviewSnapshot[] }) {
  const [previewIndex, setPreviewIndex] = useState(() => (previewSnapshots.length > 0 ? 0 : -1));
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
    <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <section className="space-y-6 py-2">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 pt-2">
            {DATASET_DOWNLOADS.map((dataset) => (
              <Button
                key={dataset.filename}
                onClick={() => handleDownload(dataset.href, dataset.filename)}
                className="theme-control-pill theme-text-primary h-12 w-full justify-start gap-3 rounded-full"
              >
                <IconBadge icon="lucide:download" className="theme-public-card-icon theme-accent-emphasis" />
                <div className="flex flex-col items-start text-xs">
                  <span className="font-semibold text-sm text-dose-accent-strong">{dataset.filename}</span>
                  <span className="theme-text-faint">{dataset.caption}</span>
                </div>
              </Button>
            ))}
            <p className="theme-text-faint px-1 text-xs leading-5">
              JSON, CC0 — refreshed nightly from the live database.
            </p>
            <IconPillLink
              href="https://github.com/josikinzz/dosewiki"
              icon="lucide:github"
              label="GitHub Repository"
              className="min-h-11 justify-start px-4 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <div className="theme-card-surface theme-about-json-preview flex min-w-0 flex-col overflow-hidden rounded-2xl border">
        <div className="theme-about-json-preview-header flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
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
              className="theme-json-preview-action min-h-11 gap-1.5 rounded-lg px-3 text-sm hover:bg-transparent"
            >
              <Icon icon={hasCopied ? "lucide:check" : "lucide:copy"} size={12} />
              {hasCopied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShuffle}
              className="theme-json-preview-action min-h-11 gap-1.5 rounded-lg px-3 text-sm hover:bg-transparent"
            >
              <Icon icon="lucide:dices" size={12} />
              Shuffle
            </Button>
          </div>
        </div>
        <div className="theme-about-json-preview-body relative flex-1 min-h-[16rem] overflow-hidden">
          <div
            aria-hidden="true"
            className="theme-json-preview-ambient pointer-events-none absolute inset-0 opacity-[0.65]"
          />
          <div
            aria-hidden="true"
            className="theme-json-preview-scanlines pointer-events-none absolute inset-0"
          />

          <div className="absolute inset-0 overflow-auto py-6 pl-3 pr-4 custom-scrollbar sm:pr-6">
            <JsonSyntaxHighlight json={previewJson} truncated={currentSnapshot?.truncated ?? false} />
          </div>
        </div>
      </div>
    </div>
  );
}
