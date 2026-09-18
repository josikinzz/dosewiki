import { diffArrays } from "diff";
import type { ReactNode } from "react";

import { DIFF_TOKEN } from "@/data/changelog/articleRecentChanges";
import { CitationNeededMarker, CitationSup } from "@/features/article/components/CitedText";
import { CITATION_MARKER_PATTERN, CITATION_NEEDED_TOKEN } from "@/lib/citations/citationTokens";
import { cn } from "@/lib/utils";
import { msg } from "@/i18n/messages";

interface ProseDiffProps {
  /** Unified-diff-style text: `-`/`+` lines and `@@ … @@` hunk labels. */
  markdown: string;
  id: string;
  className?: string;
  /**
   * How to render `[cite:id]` tokens: the article's current numbering, and
   * the page the `#ref-…` anchors live on (empty on the article itself).
   */
  citations?: CitationContext;
}

export type CitationContext = {
  /** Reference id → citation number in the article as it stands now. */
  numbers: Record<string, number>;
  /** Path prefix for reference anchors; "" when rendering on the article page. */
  hrefBase: string;
};

const NO_CITATIONS: CitationContext = { numbers: {}, hrefBase: "" };

function isCitationToken(token: string): boolean {
  CITATION_MARKER_PATTERN.lastIndex = 0;
  const match = CITATION_MARKER_PATTERN.exec(token);
  return match !== null && match[0] === token;
}

type Block =
  | { kind: "label"; text: string }
  | { kind: "pair"; before: string; after: string }
  | { kind: "removed"; text: string }
  | { kind: "added"; text: string }
  | { kind: "context"; text: string };

/**
 * Group the stored diff into readable blocks. A run of `-` lines followed by a
 * run of `+` lines is paired positionally (line i of each), which is how the
 * editor writes prose edits: one field before, the same field after. Leftover
 * lines on either side stand alone.
 */
function toBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let removed: string[] = [];
  let added: string[] = [];

  const flush = () => {
    const pairs = Math.min(removed.length, added.length);
    for (let i = 0; i < pairs; i += 1) {
      blocks.push({ kind: "pair", before: removed[i], after: added[i] });
    }
    for (const text of removed.slice(pairs)) blocks.push({ kind: "removed", text });
    for (const text of added.slice(pairs)) blocks.push({ kind: "added", text });
    removed = [];
    added = [];
  };

  for (const line of markdown.split("\n")) {
    if (line.startsWith("-")) {
      // A `+` run already started means this `-` opens a new hunk.
      if (added.length > 0) flush();
      removed.push(line.slice(1).trim());
    } else if (line.startsWith("+")) {
      added.push(line.slice(1).trim());
    } else {
      flush();
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      if (trimmed.startsWith("@@")) {
        blocks.push({ kind: "label", text: trimmed.replace(/^@@\s*|\s*@@$/g, "") });
      } else {
        blocks.push({ kind: "context", text: trimmed });
      }
    }
  }
  flush();
  return blocks;
}

// Both marks take the active theme's accent as their ink, so the changed
// words are the one accent-coloured thing in the passage, and nothing else:
// a wash behind them broke the sentence into chips and made it harder to
// read. Before is struck, After is heavier.
const removedClass = "text-[color:var(--theme-accent-strong)] line-through decoration-[1.5px] decoration-current";
const addedClass = "font-semibold text-[color:var(--theme-accent-strong)] no-underline";

const sideLabelClass = "theme-text-faint mb-1 block text-[11px] font-semibold uppercase tracking-[0.15em]";
const passageClass = "theme-text-secondary text-sm leading-relaxed [text-wrap:pretty]";

/** Words kept on each side of a change before the passage is elided. */
const CONTEXT_WORDS = 8;
const ELLIPSIS = "…";

const isWhitespace = (token: string) => /^\s+$/.test(token);

/**
 * A citation token rendered the way the article renders it: a numbered
 * superscript link when the source is currently cited, a plain "source" chip
 * when it is not (removed, or renamed since), and the citation-needed marker
 * for the sentinel.
 */
function CitationToken({ token, citations }: { token: string; citations: CitationContext }) {
  if (token === CITATION_NEEDED_TOKEN) {
    return <CitationNeededMarker />;
  }
  const id = token.slice("[cite:".length, -1);
  const number = citations.numbers[id];
  const { hrefBase } = citations;
  return (
    <CitationSup
      citations={[
        number
          ? { accessibleLabel: msg("Citation {{number}}"), href: `${hrefBase}#ref-${id}`, label: String(number), referenceId: id }
          : { accessibleLabel: msg("Source no longer cited"), href: `${hrefBase}#sources`, label: "source", title: id },
      ]}
    />
  );
}

function renderTokens(tokens: string[], citations: CitationContext, keyPrefix: string): ReactNode[] {
  return tokens.map((token, index) =>
    isCitationToken(token) ? (
      <CitationToken key={`${keyPrefix}-${index}`} token={token} citations={citations} />
    ) : (
      token
    ),
  );
}

type Parts = ReturnType<typeof diffArrays<string>>;

/**
 * Which tokens of the shared stream to show: every changed token plus a
 * window of `CONTEXT_WORDS` words on each side of it. Computed once, so
 * Before and After show the same surroundings even when one side has no
 * marks of its own (a pure insertion). Gaps of a word or two are kept whole
 * rather than replaced with an ellipsis.
 */
function keepWindows(parts: Parts): boolean[] {
  const tokens = parts.flatMap((part) => part.value);
  const changed = parts.flatMap((part) => part.value.map(() => Boolean(part.added || part.removed)));
  const keep = new Array<boolean>(tokens.length).fill(false);
  for (let i = 0; i < tokens.length; i += 1) {
    if (!changed[i]) continue;
    keep[i] = true;
    let seen = 0;
    for (let j = i - 1; j >= 0 && seen < CONTEXT_WORDS; j -= 1) {
      keep[j] = true;
      if (!isWhitespace(tokens[j])) seen += 1;
    }
    seen = 0;
    for (let j = i + 1; j < tokens.length && seen < CONTEXT_WORDS; j += 1) {
      keep[j] = true;
      if (!isWhitespace(tokens[j])) seen += 1;
    }
  }
  let start = -1;
  for (let i = 0; i <= keep.length; i += 1) {
    if (i < keep.length && !keep[i]) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      const words = tokens.slice(start, i).filter((token) => !isWhitespace(token)).length;
      if (words <= 2) keep.fill(true, start, i);
      start = -1;
    }
  }
  return keep;
}

type Run = { changed: boolean; tokens: string[] } | { gap: true };

/** Group one side's kept tokens into unchanged runs, marked runs, and gaps. */
function toRuns(parts: Parts, keep: boolean[], omit: "added" | "removed"): Run[] {
  const runs: Run[] = [];
  let index = 0;
  let gapOpen = false;
  for (const part of parts) {
    const skip = Boolean(part[omit]);
    const changed = Boolean(part.added || part.removed);
    for (const token of part.value) {
      const kept = keep[index];
      index += 1;
      if (skip) continue;
      if (!kept) {
        if (!gapOpen) {
          runs.push({ gap: true });
          gapOpen = true;
        }
        continue;
      }
      gapOpen = false;
      const last = runs[runs.length - 1];
      if (last && !("gap" in last) && last.changed === changed) {
        last.tokens.push(token);
      } else {
        runs.push({ changed, tokens: [token] });
      }
    }
  }
  return runs;
}

function renderSide(
  runs: Run[],
  Mark: "del" | "ins",
  markClass: string,
  citations: CitationContext,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  runs.forEach((run, index) => {
    if ("gap" in run) {
      nodes.push(
        <span key={index} className="theme-text-faint" aria-label="unchanged text omitted">
          {index === 0 ? `${ELLIPSIS} ` : index === runs.length - 1 ? ` ${ELLIPSIS}` : ` ${ELLIPSIS} `}
        </span>,
      );
      return;
    }
    if (!run.changed) {
      nodes.push(<span key={index}>{renderTokens(run.tokens, citations, String(index))}</span>);
      return;
    }
    // Whitespace at the edges of a change stays outside the mark, so the
    // strike and the wash hug the words and speech does not run tokens together.
    let first = 0;
    let last = run.tokens.length;
    while (first < last && isWhitespace(run.tokens[first])) first += 1;
    while (last > first && isWhitespace(run.tokens[last - 1])) last -= 1;
    const lead = run.tokens.slice(0, first).join("");
    const trail = run.tokens.slice(last).join("");
    const inner = run.tokens.slice(first, last);
    if (lead) nodes.push(lead);
    if (inner.length > 0) {
      nodes.push(
        <Mark key={index} className={markClass}>
          <span className="sr-only">{Mark === "del" ? "removed: " : "added: "}</span>
          {renderTokens(inner, citations, String(index))}
        </Mark>,
      );
    }
    if (trail) nodes.push(trail);
  });
  return nodes;
}

/**
 * Two passages, Before and After, trimmed to the same words around the
 * change: what Before loses is struck, what After gains is highlighted, and
 * long unchanged stretches collapse to an ellipsis on both sides alike. Side
 * by side from `md` up, stacked below.
 */
function BeforeAfter({
  before,
  after,
  citations,
}: {
  before: string;
  after: string;
  citations: CitationContext;
}) {
  const parts = diffArrays(before.match(DIFF_TOKEN) ?? [], after.match(DIFF_TOKEN) ?? []);
  const keep = keepWindows(parts);
  const beforeRuns = toRuns(parts, keep, "added");
  const afterRuns = toRuns(parts, keep, "removed");

  return (
    <div className="grid gap-3 md:grid-cols-2 md:gap-5">
      <div>
        <span className={sideLabelClass}>Before</span>
        <p className={passageClass}>{renderSide(beforeRuns, "del", removedClass, citations)}</p>
      </div>
      <div className="border-t border-dose-border pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
        <span className={sideLabelClass}>After</span>
        <p className={passageClass}>{renderSide(afterRuns, "ins", addedClass, citations)}</p>
      </div>
    </div>
  );
}

function Standalone({
  kind,
  text,
  citations,
}: {
  kind: "removed" | "added";
  text: string;
  citations: CitationContext;
}) {
  const tokens = text.match(DIFF_TOKEN) ?? [];
  return (
    <div>
      <span className={sideLabelClass}>{kind === "removed" ? "Removed" : "Added"}</span>
      <p className={passageClass}>
        {kind === "removed" ? (
          <del className={removedClass}>
            <span className="sr-only">removed: </span>
            {renderTokens(tokens, citations, "removed")}
          </del>
        ) : (
          <ins className={addedClass}>
            <span className="sr-only">added: </span>
            {renderTokens(tokens, citations, "added")}
          </ins>
        )}
      </p>
    </div>
  );
}

/**
 * A prose edit shown as the text before and the text after, with the changed
 * words marked on each side. For the changelog's line-pair diffs of article
 * copy; JSON and structural diffs stay on `ChangelogDiff`.
 */
export function ProseDiff({ markdown, id, className, citations = NO_CITATIONS }: ProseDiffProps) {
  const blocks = toBlocks(markdown);
  // One field edited: the row above already names it. Several: label each.
  const showLabels = blocks.filter((block) => block.kind === "label").length > 1;
  return (
    <div id={id} className={cn("flex flex-col gap-3", className)}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "label":
            return showLabels ? (
              <p key={index} className="theme-accent-heading text-xs font-semibold">
                {block.text.replace(/\./g, " › ").replace(/_/g, " ")}
              </p>
            ) : null;
          case "pair":
            return <BeforeAfter key={index} before={block.before} after={block.after} citations={citations} />;
          case "removed":
          case "added":
            return <Standalone key={index} kind={block.kind} text={block.text} citations={citations} />;
          case "context":
            return (
              <p key={index} className="theme-text-muted text-sm leading-relaxed">
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}
