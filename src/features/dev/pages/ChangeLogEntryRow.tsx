"use client";

import { memo, useState } from "react";

import { ExpandButton, ExpandIndicator } from "@/components/common/ExpandButton";
import { HighlightedText } from "@/components/common/HighlightedText";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_HALO_Y, TOUCH_ICON } from "@/components/ui/touchTargets";
import { sliceArticleDiff } from "@/data/changelog/articleRecentChanges";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { EditorActionGroup, Notice } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { devHref } from "@/utils/devHref";
import { viewToPath } from "@/utils/routing";

import {
  articleNames,
  formatSaveMoment,
  formatSaveTime,
  type EntrySummary,
} from "./changeLogModel";
import type { ChangeLogController } from "./useDevModeChangeLog";

/** Articles an open save lists before folding the rest behind a count. */
const OPEN_ARTICLE_CAP = 6;

type ChangeLogEntryRowProps = {
  entry: ChangeLogEntry;
  summary: EntrySummary;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  /** The saver's display name, or null when the save carries no stamp. */
  submitter: string | null;
  /** The save came with the site's bundled archive and is not in the server history. */
  archived: boolean;
  /** The article the list is filtered to, so an open save can show only its part. */
  filterSlug: string | null;
  search: string;
  feedback: ChangeLogController["entryFeedback"];
  onClearFeedback: () => void;
  onFilterArticle: (slug: string) => void;
  onCopy: (entry: ChangeLogEntry) => void;
  onDownload: (entry: ChangeLogEntry) => void;
};

function LineCounts({ added, removed }: { added: number; removed: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      aria-label={`${added} line${added === 1 ? "" : "s"} added, ${removed} line${removed === 1 ? "" : "s"} removed`}
    >
      {added > 0 || removed === 0 ? <span className="text-[var(--editor-code-line-add-text)]">+{added}</span> : null}
      {removed > 0 ? <span className="text-[var(--editor-code-line-remove-text)]">-{removed}</span> : null}
    </span>
  );
}

/**
 * One save: the whole summary line is the disclosure for its diff (the
 * heading wraps the button, the accordion pattern). Opening it shows the
 * articles it touched, with a filter and a public link for each, the diff
 * actions, and the diff itself, cut to the filtered article's part when the
 * list is filtered to one.
 */
function ChangeLogEntryRowComponent({
  entry,
  summary,
  isExpanded,
  onToggle,
  submitter,
  archived,
  filterSlug,
  search,
  feedback,
  onClearFeedback,
  onFilterArticle,
  onCopy,
  onDownload,
}: ChangeLogEntryRowProps) {
  const [allArticles, setAllArticles] = useState(false);
  const [wholeSave, setWholeSave] = useState(false);
  const diffId = `change-log-diff-${entry.id}`;
  const headlineId = `change-log-entry-${entry.id}`;
  const timeId = `change-log-time-${entry.id}`;

  const filteredArticle = filterSlug ? entry.articles.find((article) => article.slug === filterSlug) ?? null : null;
  const slice = filteredArticle && entry.articles.length > 1 ? sliceArticleDiff(entry.markdown, filteredArticle) : "";
  const showSlice = Boolean(slice) && !wholeSave;
  const diffText = showSlice ? slice : entry.markdown;
  const shownArticles = allArticles ? entry.articles : entry.articles.slice(0, OPEN_ARTICLE_CAP);
  const hiddenArticles = entry.articles.length - shownArticles.length;
  // One record to open: the only article, or the one the list is filtered to.
  const editable = entry.articles.length === 1 ? entry.articles[0] : filteredArticle;

  return (
    <article aria-labelledby={`${timeId} ${headlineId}`} data-change-entry={entry.id} className="py-0.5">
      <h4>
        <button
          type="button"
          data-change-toggle=""
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? diffId : undefined}
          onClick={() => onToggle(entry.id)}
          className={cn(
            "theme-dev-link-row group flex min-h-11 w-full items-start gap-3 rounded-control px-2.5 py-2.5 text-left transition-colors motion-reduce:transition-none",
            isExpanded && "theme-dev-link-lead",
          )}
        >
          <time
            id={timeId}
            dateTime={entry.createdAt}
            title={formatSaveMoment(entry.createdAt)}
            className="theme-text-muted w-[4.5rem] shrink-0 pt-px text-xs tabular-nums"
          >
            {formatSaveTime(entry.createdAt)}
          </time>
          <span className="min-w-0 flex-1">
            <span id={headlineId} className="theme-text-primary block break-words text-sm">
              <span className="font-medium">
                <HighlightedText text={summary.headline} query={search} />
              </span>
              {summary.kind === "source" && summary.detail ? (
                <span className="theme-text-secondary">
                  {" "}
                  “<HighlightedText text={summary.detail} query={search} />”
                </span>
              ) : null}
              {summary.location ? (
                <span className="theme-text-muted">
                  {" in "}
                  <HighlightedText text={summary.location} query={search} />
                </span>
              ) : null}
              {summary.kind !== "source" && summary.detail ? (
                <span className="theme-text-muted">
                  {": "}
                  <HighlightedText text={summary.detail} query={search} />
                </span>
              ) : null}
            </span>
            <span className="theme-text-faint mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
              <span className="sr-only">, </span>
              {entry.articles.length > 0 ? (
                <span className="theme-text-muted min-w-0">{articleNames(entry.articles)}</span>
              ) : null}
              <LineCounts added={summary.linesAdded} removed={summary.linesRemoved} />
              {submitter ? <span>{`by ${submitter}`}</span> : null}
              {archived ? (
                <span title="Bundled with the site; the server history does not hold this save.">
                  <span className="sr-only">, </span>Archive
                </span>
              ) : null}
            </span>
          </span>
          <ExpandIndicator isExpanded={isExpanded} className="theme-dev-link-row-chevron mt-0.5 shrink-0" />
        </button>
      </h4>

      {isExpanded ? (
        <div id={diffId} className="theme-reveal-enter space-y-3 px-2.5 pb-4 pt-2 sm:pl-[6.125rem]">
          {entry.articles.length > 0 ? (
            <div className="space-y-1.5">
              <p className="type-meta-label theme-text-muted">
                {entry.articles.length === 1 ? "Article" : `${entry.articles.length} articles`}
              </p>
              <ul className="flex flex-wrap items-center gap-1.5">
                {shownArticles.map((article) => (
                  <li
                    key={`${entry.id}-${article.slug}`}
                    className="inline-flex items-center rounded-full border border-[color:var(--editor-panel-border)]"
                  >
                    <Button
                      type="button"
                      variant="ghostPill"
                      size="xs"
                      aria-pressed={filterSlug === article.slug}
                      title={`Show only saves to ${article.title}`}
                      className={cn("rounded-r-none", TOUCH_HALO_Y)}
                      onClick={() => onFilterArticle(article.slug)}
                    >
                      <Icon icon="lucide:filter" size={13} />
                      {article.title}
                      <span className="sr-only">, show only its saves</span>
                    </Button>
                    <a
                      href={viewToPath({ type: "substance", slug: article.slug })}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${article.title} article in a new tab`}
                      title={`Open ${article.title} on the site`}
                      className={cn(
                        "theme-focus-ring theme-text-muted hover:text-dose-text inline-flex h-7 w-8 items-center justify-center rounded-r-full border-l border-[color:var(--editor-panel-border)] transition-colors",
                        TOUCH_ICON,
                      )}
                    >
                      <Icon icon="lucide:external-link" size={13} />
                    </a>
                  </li>
                ))}
                {hiddenArticles > 0 || allArticles ? (
                  <li>
                    <ExpandButton
                      variant="count"
                      count={allArticles ? entry.articles.length - OPEN_ARTICLE_CAP : hiddenArticles}
                      isExpanded={allArticles}
                      onToggle={() => setAllArticles((open) => !open)}
                      ariaLabel={allArticles ? "Show fewer articles" : `Show ${hiddenArticles} more articles`}
                    />
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <EditorActionGroup label="Save entry actions">
            <Button type="button" variant="outline" size="sm" onClick={() => onCopy(entry)}>
              <Icon icon="lucide:copy" size={15} />
              Copy diff
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onDownload(entry)}>
              <Icon icon="lucide:download" size={15} />
              Download .diff
            </Button>
            {editable ? (
              <a
                href={devHref({ type: "dev", tab: "articles", slug: editable.slug })}
                className="theme-focus-ring theme-accent-underline inline-flex min-h-8 items-center gap-1.5 rounded-control px-1 text-sm font-medium text-dose-accent-strong underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-11"
              >
                {`Open ${editable.title} in Substances`}
                <Icon icon="lucide:arrow-right" size={14} />
              </a>
            ) : null}
            {entry.commit?.url ? (
              <a
                href={entry.commit.url}
                target="_blank"
                rel="noreferrer"
                title={entry.commit.message}
                className="theme-focus-ring theme-text-muted inline-flex min-h-8 items-center gap-1.5 rounded-control px-1 text-sm underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-11"
              >
                Commit
                <span className="sr-only">{`: ${entry.commit.message}, opens in a new tab`}</span>
                <Icon icon="lucide:external-link" size={13} />
              </a>
            ) : null}
          </EditorActionGroup>
          {feedback?.entryId === entry.id ? (
            <Notice placement="inline" tone={feedback.tone} dismiss={onClearFeedback}>
              {feedback.message}
            </Notice>
          ) : null}

          {slice ? (
            <p className="theme-text-muted flex flex-wrap items-center gap-x-2 text-xs">
              <span>
                {showSlice
                  ? `Showing the ${filteredArticle?.title} part of this save.`
                  : `Showing all ${entry.articles.length} articles in this save.`}
              </span>
              <Button
                type="button"
                variant="link"
                size="auto"
                className="h-auto p-0 text-xs"
                onClick={() => setWholeSave((whole) => !whole)}
              >
                {showSlice ? "Show the whole save" : `Show only ${filteredArticle?.title}`}
              </Button>
            </p>
          ) : null}
          <DiffPreview diffText={diffText} maxHeight="min(60vh, 640px)" highlight={search} />
        </div>
      ) : null}
    </article>
  );
}

export const ChangeLogEntryRow = memo(ChangeLogEntryRowComponent);
