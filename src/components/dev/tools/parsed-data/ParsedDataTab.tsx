import { memo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/common/SectionCard";
import { parsedDataMarkdown } from "@/data/content/parsedData";
import parsedSourcesJson from "@/data/parsed-sources.json";

const markdownComponents = {
  table: ({ node, ...props }: { node?: unknown }) => (
    <div className="my-6 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }: { node?: unknown }) => (
    <thead className="bg-white/5" {...props} />
  ),
  th: ({ node, ...props }: { node?: unknown }) => (
    <th
      className="border border-white/10 px-3 py-2 text-left font-medium text-white/90"
      {...props}
    />
  ),
  td: ({ node, ...props }: { node?: unknown }) => (
    <td className="border border-white/10 px-3 py-2 text-white/70" {...props} />
  ),
  tr: ({ node, ...props }: { node?: unknown }) => (
    <tr className="even:bg-white/[0.02]" {...props} />
  ),
  h1: ({ node, ...props }: { node?: unknown }) => (
    <h1 className="mb-4 mt-8 text-2xl font-bold text-white first:mt-0" {...props} />
  ),
  h2: ({ node, ...props }: { node?: unknown }) => (
    <h2 className="mb-3 mt-8 text-xl font-semibold text-white" {...props} />
  ),
  h3: ({ node, ...props }: { node?: unknown }) => (
    <h3 className="mb-2 mt-6 text-lg font-medium text-fuchsia-200" {...props} />
  ),
  h4: ({ node, ...props }: { node?: unknown }) => (
    <h4 className="mb-2 mt-4 text-base font-medium text-fuchsia-300" {...props} />
  ),
  p: ({ node, ...props }: { node?: unknown }) => (
    <p className="my-3 leading-relaxed text-white/75" {...props} />
  ),
  strong: ({ node, ...props }: { node?: unknown }) => (
    <strong className="text-fuchsia-200" {...props} />
  ),
  em: ({ node, ...props }: { node?: unknown }) => (
    <em className="text-white/80" {...props} />
  ),
  code: ({ node, ...props }: { node?: unknown }) => (
    <code
      className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-fuchsia-200"
      {...props}
    />
  ),
  pre: ({ node, ...props }: { node?: unknown }) => (
    <pre
      className="my-4 overflow-x-auto rounded-lg bg-black/30 p-4 text-sm"
      {...props}
    />
  ),
  ul: ({ node, ...props }: { node?: unknown }) => (
    <ul className="my-3 list-disc space-y-1 pl-5 text-white/75" {...props} />
  ),
  ol: ({ node, ...props }: { node?: unknown }) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 text-white/75" {...props} />
  ),
  li: ({ node, ...props }: { node?: unknown }) => (
    <li className="text-white/75 marker:text-white/40" {...props} />
  ),
  hr: () => <hr className="my-8 border-white/10" />,
  blockquote: ({ node, ...props }: { node?: unknown }) => (
    <blockquote
      className="my-4 border-l-2 border-fuchsia-400/50 pl-4 italic text-white/60"
      {...props}
    />
  ),
  a: ({ node, ...props }: { node?: unknown }) => (
    <a
      className="text-fuchsia-200 underline transition hover:text-fuchsia-100"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
};

export const ParsedDataTab = memo(function ParsedDataTab() {
  const handleDownload = useCallback(() => {
    const blob = new Blob([JSON.stringify(parsedSourcesJson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parsed-sources.json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="mx-auto mt-10 max-w-4xl">
      {/* Download Banner */}
      <div className="mb-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Database className="h-8 w-8 shrink-0 text-fuchsia-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Parsed Sources Data</h2>
            <p className="text-sm text-white/60">
              679 substances with dosage, effects, interactions, and more
            </p>
          </div>
        </div>
        <Button onClick={handleDownload} className="shrink-0 gap-2">
          <Download className="h-4 w-4" />
          Download JSON (~15 MB)
        </Button>
      </div>

      {/* Markdown Content */}
      <SectionCard>
        <article className="max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {parsedDataMarkdown}
          </ReactMarkdown>
        </article>
      </SectionCard>
    </div>
  );
});
