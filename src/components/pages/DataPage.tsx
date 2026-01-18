import { memo, useCallback, useMemo } from "react";
import { PageHeader } from "../layout/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { Icon } from "../common/Icon";
import { Button } from "@/components/ui/button";
import { useLibrary } from "../../data/SubstanceIndexProvider";
import type { SubstanceArticle } from "../../schema";


/** Canonical field order from substance.schema.ts */
const ARTICLE_FIELD_ORDER = [
  'id', 'title', 'priority', 'index_categories', 'identification', 'classification',
  'summary', 'dosage', 'duration', 'subjective_effects', 'comparisons', 'pharmacology',
  'interactions', 'reagent_testing', 'tolerance', 'harm_potential', 'history_culture',
  'legality', 'source_citations', 'citations'
] as const;

/** Reorder article fields to canonical order for display */
function reorderArticleFields(article: SubstanceArticle): SubstanceArticle {
  const ordered: Record<string, unknown> = {};
  // Add fields in canonical order
  for (const key of ARTICLE_FIELD_ORDER) {
    if (key in article) {
      ordered[key] = article[key as keyof SubstanceArticle];
    }
  }
  // Add any unexpected fields at the end (shouldn't happen, but safe)
  for (const key of Object.keys(article)) {
    if (!(key in ordered)) {
      ordered[key] = article[key as keyof SubstanceArticle];
    }
  }
  return ordered as SubstanceArticle;
}

function JsonSyntaxHighlight({ json }: { json: string }) {
  const highlighted = useMemo(() => {
    const escaped = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Tokenize and highlight
    const tokens: string[] = [];
    let i = 0;
    while (i < escaped.length) {
      // String
      if (escaped[i] === '"') {
        let end = i + 1;
        while (end < escaped.length && escaped[end] !== '"') {
          if (escaped[end] === '\\') end++;
          end++;
        }
        end++;
        const str = escaped.slice(i, end);
        // Check if it's a key (followed by :)
        let j = end;
        while (j < escaped.length && /\s/.test(escaped[j])) j++;
        const isKey = escaped[j] === ':';
        const cls = isKey ? "text-fuchsia-300" : "text-emerald-400";
        tokens.push(`<span class="${cls}">${str}</span>`);
        i = end;
      }
      // Number
      else if (/[-\d]/.test(escaped[i]) && (i === 0 || /[\s,\[:{]/.test(escaped[i - 1]))) {
        let end = i;
        if (escaped[end] === '-') end++;
        while (end < escaped.length && /[\d.]/.test(escaped[end])) end++;
        if (end > i && (i === 0 || escaped[i] !== '-' || end > i + 1)) {
          const num = escaped.slice(i, end);
          if (/^-?\d+\.?\d*$/.test(num)) {
            tokens.push(`<span class="text-sky-400">${num}</span>`);
            i = end;
            continue;
          }
        }
        tokens.push(escaped[i]);
        i++;
      }
      // Keywords
      else if (escaped.slice(i, i + 4) === 'true') {
        tokens.push('<span class="text-amber-400">true</span>');
        i += 4;
      } else if (escaped.slice(i, i + 5) === 'false') {
        tokens.push('<span class="text-amber-400">false</span>');
        i += 5;
      } else if (escaped.slice(i, i + 4) === 'null') {
        tokens.push('<span class="text-rose-400">null</span>');
        i += 4;
      }
      // Other
      else {
        tokens.push(escaped[i]);
        i++;
      }
    }
    return tokens.join('');
  }, [json]);

  return (
    <pre
      className="overflow-x-auto text-xs leading-relaxed"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

export const DataPage = memo(function DataPage() {
  const { articles } = useLibrary();

  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = "/articles.json";
    link.download = "articles.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Select 5 random articles for preview (stable across renders) and reorder fields
  const previewArticles = useMemo(() => {
    // Use a seeded shuffle based on article id for stability
    const shuffled = [...articles].sort((a, b) => {
      const hashA = (a.id ?? 0) * 31 + (a.title?.charCodeAt(0) ?? 0);
      const hashB = (b.id ?? 0) * 31 + (b.title?.charCodeAt(0) ?? 0);
      return ((hashA * 17) % 100) - ((hashB * 17) % 100);
    });
    const selected = shuffled.slice(0, 5);
    // Reorder fields to canonical order (Convex doesn't preserve field order)
    return selected.map(reorderArticleFields);
  }, [articles]);

  const previewJson = useMemo(() => {
    return JSON.stringify(previewArticles, null, 2);
  }, [previewArticles]);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pb-20 pt-12">
      <PageHeader
        title="Download"
        icon="lucide:download"
      />

      <div className="space-y-6 md:space-y-8">
        {/* Download Section */}
        <SectionCard className="space-y-4">
          <p className="text-sm text-white/70">
            All data is public domain under{" "}
            <a
              href="https://creativecommons.org/publicdomain/zero/1.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fuchsia-300 hover:text-fuchsia-200"
            >
              CC0 1.0
            </a>
            .
          </p>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleDownload} className="gap-2">
              <Icon icon="lucide:download" size={16} />
              articles.json
            </Button>
            <Button variant="secondary" asChild className="gap-2">
              <a
                href="https://github.com/dose-wiki/dose.wiki"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon icon="lucide:github" size={16} />
                GitHub
              </a>
            </Button>
          </div>
        </SectionCard>

        {/* JSON Preview */}
        <SectionCard className="space-y-3">
          <h2 className="text-sm font-medium text-white/80">Preview (5 random articles)</h2>
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-white/10 bg-[#0a0612] p-4 font-mono">
            <JsonSyntaxHighlight json={previewJson} />
          </div>
        </SectionCard>
      </div>
    </main>
  );
});
