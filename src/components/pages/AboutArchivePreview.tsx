"use client";

import { useCallback, useMemo, useState } from "react";
import { Icon } from "../common/Icon";
import { IconBadge } from "../common/IconBadge";
import { SectionCard } from "../common/SectionCard";
import { Button } from "@/components/ui/button";
import {
  IconPillLink,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import type { SubstanceArticle } from "../../schema";

/** Canonical field order from substance.schema.ts */
const ARTICLE_FIELD_ORDER = [
  "id", "title", "priority", "index_categories", "identification", "classification",
  "summary", "dosage", "duration", "subjective_effects", "comparisons", "pharmacology",
  "interactions", "reagent_testing", "tolerance", "harm_potential", "history_culture",
  "legality", "source_citations", "citations",
] as const;

function reorderArticleFields(article: SubstanceArticle): SubstanceArticle {
  const ordered: Record<string, unknown> = {};
  for (const key of ARTICLE_FIELD_ORDER) {
    if (key in article) {
      ordered[key] = article[key as keyof SubstanceArticle];
    }
  }
  for (const key of Object.keys(article)) {
    if (!(key in ordered)) {
      ordered[key] = article[key as keyof SubstanceArticle];
    }
  }
  return ordered as SubstanceArticle;
}

function JsonSyntaxHighlight({ json }: { json: string }) {
  const highlightedLines = useMemo(() => {
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
        const cls = isKey ? "theme-json-preview-key" : "text-emerald-400";
        tokens.push(`<span class="${cls}">${str}</span>`);
        i = end;
      } else if (/[-\d]/.test(escaped[i]) && (i === 0 || /[\s,:[{]/.test(escaped[i - 1]))) {
        let end = i;
        if (escaped[end] === "-") end++;
        while (end < escaped.length && /[\d.]/.test(escaped[end])) end++;
        if (end > i && (i === 0 || escaped[i] !== "-" || end > i + 1)) {
          const num = escaped.slice(i, end);
          if (/^-?\d+\.?\d*$/.test(num)) {
            tokens.push(`<span class="text-sky-400">${num}</span>`);
            i = end;
            continue;
          }
        }
        tokens.push(escaped[i]);
        i++;
      } else if (escaped.slice(i, i + 4) === "true") {
        tokens.push(`<span class="text-amber-400">true</span>`);
        i += 4;
      } else if (escaped.slice(i, i + 5) === "false") {
        tokens.push(`<span class="text-amber-400">false</span>`);
        i += 5;
      } else if (escaped.slice(i, i + 4) === "null") {
        tokens.push(`<span class="text-rose-400">null</span>`);
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
    </div>
  );
}

export function AboutArchivePreview({ previewArticles }: { previewArticles: SubstanceArticle[] }) {
  const [previewIndex, setPreviewIndex] = useState(() => (previewArticles.length > 0 ? 0 : -1));
  const [hasCopied, setHasCopied] = useState(false);

  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = "/SubstanceIndex.json";
    link.download = "SubstanceIndex.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleShuffle = useCallback(() => {
    if (previewArticles.length === 0) return;
    if (previewArticles.length === 1) {
      setPreviewIndex(0);
      return;
    }

    let next = previewIndex;
    for (let i = 0; i < 6; i++) {
      const candidate = Math.floor(Math.random() * previewArticles.length);
      if (candidate !== previewIndex) {
        next = candidate;
        break;
      }
    }
    setPreviewIndex(next);
  }, [previewArticles.length, previewIndex]);

  const previewArticle = useMemo(() => {
    if (previewIndex < 0 || !previewArticles[previewIndex]) {
      return null;
    }

    return reorderArticleFields(previewArticles[previewIndex]);
  }, [previewArticles, previewIndex]);

  const previewJson = useMemo(() => {
    if (previewArticle === null) return JSON.stringify("No preview available.", null, 2);
    return JSON.stringify(previewArticle, null, 2);
  }, [previewArticle]);

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
      <SectionCard className="space-y-6">
        <div className="space-y-4">
          <PublicSectionHeading
            variant="card"
            icon="lucide:archive"
            iconLabel="Archive"
            title="Download archival snapshot"
          />
          <p className="text-sm theme-text-muted leading-relaxed">
            Convex is the live runtime source for public pages. The static JSON file is a
            retained archival snapshot for compatibility and offline inspection. Content is licensed under{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="theme-accent-emphasis  underline decoration-fuchsia-300/30 underline-offset-2"
            >
              CC BY-SA 4.0
            </a>
            . You are free to share and adapt with attribution.
          </p>
          <div className="flex flex-col gap-3 pt-2">
            <Button onClick={handleDownload} className="w-full justify-start gap-3 h-12 rounded-xl theme-article-subsection-card-nested  theme-text-primary border border-[color:var(--editor-panel-border)]">
              <IconBadge icon="lucide:download" className="bg-fuchsia-500/20 theme-accent-emphasis" />
              <div className="flex flex-col items-start text-xs">
                <span className="font-semibold text-sm">SubstanceIndex.json</span>
                <span className="theme-text-faint">Static JSON snapshot</span>
              </div>
            </Button>
            <IconPillLink
              href="https://github.com/dose-wiki/dose.wiki"
              icon="lucide:github"
              label="GitHub Repository"
              className="min-h-11 justify-start px-4 py-2 text-sm"
            />
          </div>
        </div>
      </SectionCard>

      <div className="theme-about-json-preview flex flex-col overflow-hidden rounded-[32px] border shadow-xl shadow-black/20">
        <div className="theme-about-json-preview-header flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-rose-500/20 border border-rose-500/50" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500/20 border border-amber-500/50" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
            </div>
            <span className="theme-json-preview-muted ml-2 text-xs font-medium">Archival SubstanceIndex.json preview</span>
          </div>
          <div className="flex items-center gap-2">
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
            className="pointer-events-none absolute inset-0 opacity-[0.65]"
            style={{
              backgroundImage:
                "radial-gradient(900px 420px at 10% -10%, rgba(217,70,239,0.16), transparent 55%), radial-gradient(700px 340px at 90% 0%, rgba(16,185,129,0.10), transparent 55%), linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 18%, transparent 82%, rgba(255,255,255,0.03))",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 6px)",
              opacity: 0.07,
              mixBlendMode: "overlay",
            }}
          />

          <div className="absolute inset-0 overflow-auto py-6 pr-6 pl-3 custom-scrollbar">
            <JsonSyntaxHighlight json={previewJson} />
          </div>
        </div>
      </div>
    </div>
  );
}
