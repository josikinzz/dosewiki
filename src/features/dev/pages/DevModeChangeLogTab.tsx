import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { viewToPath } from "@/utils/routing";
import type { ChangeLogController } from "./useDevModeChangeLog";

type DevModeChangeLogTabProps = {
  controller: ChangeLogController;
};

export function DevModeChangeLogTab({ controller }: DevModeChangeLogTabProps) {
  const {
    notice,
    totalEntriesCount,
    filters,
    articleOptions,
    articleFrequency,
    filteredEntries,
    activeFilterCount,
    latestEntry,
    filtersCardClassName,
    handleArticleSelect,
    handleSearchChange,
    handleDateChange,
    applyQuickDateRange,
    clearFilters,
    focusArticleFilter,
    handleCopyEntry,
    handleDownloadEntry,
  } = controller;

  return (
    <div className="mt-10 grid w-full gap-6 md:grid-cols-[19rem,1fr]">
      <div className="min-w-0 space-y-6">
        <SectionCard className={filtersCardClassName}>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-fuchsia-200">Refine history</h2>
          </div>

          <div className="space-y-3">
            <label
              className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45"
              htmlFor="change-log-article"
            >
              Article
            </label>
            <Select value={filters.articleSlug ?? "__all__"} onValueChange={handleArticleSelect}>
              <SelectTrigger id="change-log-article">
                <SelectValue placeholder="All articles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All articles</SelectItem>
                {articleOptions.map((option) => (
                  <SelectItem key={option.slug} value={option.slug}>
                    {option.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label
                className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45"
                htmlFor="change-log-start"
              >
                Start date
              </label>
              <Input
                id="change-log-start"
                type="date"
                value={filters.startDate ?? ""}
                onChange={handleDateChange("startDate")}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45"
                htmlFor="change-log-end"
              >
                End date
              </label>
              <Input
                id="change-log-end"
                type="date"
                value={filters.endDate ?? ""}
                onChange={handleDateChange("endDate")}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Button
              variant="glass"
              size="xs"
              className="rounded-full"
              onClick={() => applyQuickDateRange(7)}
            >
              Past 7 days
            </Button>
            <Button
              variant="glass"
              size="xs"
              className="rounded-full"
              onClick={() => applyQuickDateRange(30)}
            >
              Past 30 days
            </Button>
            <Button
              variant="glass"
              size="xs"
              className="rounded-full"
              onClick={() => applyQuickDateRange(null)}
            >
              All time
            </Button>
          </div>

          <div className="space-y-2">
            <label
              className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45"
              htmlFor="change-log-search"
            >
              Search
            </label>
            <Input
              id="change-log-search"
              type="search"
              placeholder="Find commits by keyword or diff copy…"
              value={filters.searchQuery}
              onChange={handleSearchChange}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
            <span className="rounded-full bg-white/10 px-3 py-1">{`${totalEntriesCount} entr${totalEntriesCount === 1 ? "y" : "ies"}`}</span>
            {latestEntry && (
              <span className="rounded-full bg-white/10 px-3 py-1">
                Latest:{" "}
                {new Date(latestEntry.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
            {articleFrequency[0] && (
              <span className="rounded-full bg-white/10 px-3 py-1">
                Most active: {articleFrequency[0].title}
              </span>
            )}
          </div>

          {activeFilterCount > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
              <span>{activeFilterCount} filters active</span>
              <Button variant="ghost" size="xs" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="min-w-0 space-y-6">
        {notice && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              notice.type === "error"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
            }`}
          >
            {notice.message}
          </div>
        )}

        <SectionCard className="min-w-0 space-y-4 bg-white/[0.04]">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-fuchsia-200">GitHub commits</h2>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950 px-6 py-16 text-center">
              <Icon icon="lucide:wrench" size={40} className="mb-4 text-white/40" />
              <p className="text-base font-semibold text-white/80">No commits logged yet</p>
              <p className="mt-2 text-sm text-white/60">
                Ship your first draft to populate the timeline.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/20"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white/90">
                        {new Date(entry.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-xs text-white/60">
                        {entry.commit?.url ? (
                          <a
                            href={entry.commit.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-fuchsia-200 transition hover:text-fuchsia-100"
                          >
                            {entry.commit.message}
                          </a>
                        ) : (
                          entry.commit.message
                        )}
                      </p>
                      {entry.submittedBy && (
                        <p className="text-xs text-white/45">Submitted by {entry.submittedBy}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="glass"
                        size="xs"
                        className="rounded-full"
                        onClick={() => handleCopyEntry(entry)}
                      >
                        <Icon icon="lucide:copy" size={16} />
                        Copy diff
                      </Button>
                      <Button
                        variant="glass"
                        size="xs"
                        className="rounded-full"
                        onClick={() => handleDownloadEntry(entry)}
                      >
                        <Icon icon="lucide:download" size={16} />
                        Download .diff
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {entry.articles.map((article) => {
                      const href = viewToPath({ type: "substance", slug: article.slug });
                      return (
                        <Button
                          key={`${entry.id}-${article.slug}`}
                          variant="glass"
                          size="xs"
                          className="rounded-full"
                          asChild
                        >
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => focusArticleFilter(article.slug)}
                          >
                            {article.title}
                          </a>
                        </Button>
                      );
                    })}
                  </div>

                  <DiffPreview diffText={entry.markdown} className="max-h-56" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
