import {
  buildArticleFrequencyIndex,
  type ChangeLogEntry,
} from "@/data/changelog/changeLog";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useDevNoticeChannel } from "@/features/dev/notices/devNoticeLifecycle";
import type { ChangelogFeedWindow } from "./useDevChangelogFeed";

export type ChangeNotice = {
  type: "success" | "error" | "pending";
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

type ChangeLogFilters = {
  articleSlug: string | null;
  startDate: string | null;
  endDate: string | null;
  searchQuery: string;
};

type ChangeLogEntryFeedback = {
  entryId: string;
  tone: "success" | "danger";
  message: string;
};

type ChangeLogArticleOption = {
  slug: string;
  title: string;
};

export type ChangeLogController = {
  notice: ChangeNotice | null;
  /** Server paging of the feed, passed through untouched from `useDevChangelogFeed`. */
  feedWindow: ChangelogFeedWindow;
  totalEntriesCount: number;
  filters: ChangeLogFilters;
  articleOptions: ChangeLogArticleOption[];
  articleFrequency: ReturnType<typeof buildArticleFrequencyIndex>;
  filteredEntries: ChangeLogEntry[];
  visibleEntries: ChangeLogEntry[];
  visibleEntriesCount: number;
  canShowMoreEntries: boolean;
  activeFilterCount: number;
  latestEntry: ChangeLogEntry | null;
  entryFeedback: ChangeLogEntryFeedback | null;
  clearEntryFeedback: () => void;
  filtersCardClassName: string;
  handleArticleSelect: (value: string) => void;
  handleSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleDateChange: (
    field: "startDate" | "endDate",
  ) => (event: ChangeEvent<HTMLInputElement>) => void;
  applyQuickDateRange: (days: number | null) => void;
  clearFilters: () => void;
  clearNotice: () => void;
  focusArticleFilter: (slug: string) => void;
  pushNotice: (next: ChangeNotice) => void;
  showMoreEntries: () => void;
  handleCopyEntry: (entry: ChangeLogEntry) => Promise<void>;
  handleDownloadEntry: (entry: ChangeLogEntry) => void;
};

const INITIAL_CHANGELOG_FILTERS: ChangeLogFilters = {
  articleSlug: null,
  startDate: null,
  endDate: null,
  searchQuery: "",
};

const CHANGELOG_VISIBLE_BATCH_SIZE = 20;

const toFileSlug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Entry timestamps render in local time, so the date filters must cut on
// local day boundaries — UTC boundaries exclude entries the list labels as
// belonging to the selected day.
const parseLocalDateBoundary = (value: string, boundary: "start" | "end"): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date =
    boundary === "start"
      ? new Date(year, month, day, 0, 0, 0, 0)
      : new Date(year, month, day, 23, 59, 59, 999);
  const timestamp = date.getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
};

const toLocalDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function useDevModeChangeLog({
  changeLogEntries,
  enableStickyPanels,
  feedWindow,
}: {
  changeLogEntries: ChangeLogEntry[];
  enableStickyPanels: boolean;
  feedWindow: ChangelogFeedWindow;
}): ChangeLogController {
  const [notice, setNotice] = useState<ChangeNotice | null>(null);
  const [filters, setFilters] = useState<ChangeLogFilters>(INITIAL_CHANGELOG_FILTERS);
  const [visibleEntriesCount, setVisibleEntriesCount] = useState(CHANGELOG_VISIBLE_BATCH_SIZE);
  const [entryFeedback, setEntryFeedback] = useState<ChangeLogEntryFeedback | null>(null);
  const entryFeedbackTimerRef = useRef<number | null>(null);
  const noticeChannel = useDevNoticeChannel("changelog");

  const articleFrequency = useMemo(
    () => buildArticleFrequencyIndex(changeLogEntries),
    [changeLogEntries],
  );

  const articleOptions = useMemo(() => {
    const map = new Map<string, ChangeLogArticleOption>();
    changeLogEntries.forEach((entry) => {
      entry.articles.forEach((article) => {
        if (!map.has(article.slug)) {
          map.set(article.slug, { slug: article.slug, title: article.title });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
  }, [changeLogEntries]);

  const normalizedRange = useMemo(
    () => ({
      start: filters.startDate ? parseLocalDateBoundary(filters.startDate, "start") : null,
      end: filters.endDate ? parseLocalDateBoundary(filters.endDate, "end") : null,
    }),
    [filters.endDate, filters.startDate],
  );

  const filteredEntries = useMemo(() => {
    const query = filters.searchQuery.trim().toLowerCase();

    return changeLogEntries.filter((entry) => {
      const entryTimestamp = Date.parse(entry.createdAt);
      if (normalizedRange.start !== null && entryTimestamp < normalizedRange.start) {
        return false;
      }
      if (normalizedRange.end !== null && entryTimestamp > normalizedRange.end) {
        return false;
      }

      if (filters.articleSlug) {
        const matchesArticle = entry.articles.some(
          (article) => article.slug === filters.articleSlug,
        );
        if (!matchesArticle) {
          return false;
        }
      }

      if (query.length > 0) {
        const commitMessage = (entry.commit?.message ?? "").toLowerCase();
        const markdown = entry.markdown.toLowerCase();
        const articleMatch = entry.articles.some(
          (article) =>
            article.title.toLowerCase().includes(query) ||
            article.slug.toLowerCase().includes(query),
        );

        if (!commitMessage.includes(query) && !markdown.includes(query) && !articleMatch) {
          return false;
        }
      }

      return true;
    });
  }, [changeLogEntries, filters.articleSlug, filters.searchQuery, normalizedRange]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.articleSlug) {
      count += 1;
    }
    if (filters.startDate) {
      count += 1;
    }
    if (filters.endDate) {
      count += 1;
    }
    if (filters.searchQuery.trim().length > 0) {
      count += 1;
    }
    return count;
  }, [filters]);

  useEffect(() => {
    setVisibleEntriesCount(CHANGELOG_VISIBLE_BATCH_SIZE);
  }, [filters.articleSlug, filters.endDate, filters.searchQuery, filters.startDate]);

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleEntriesCount),
    [filteredEntries, visibleEntriesCount],
  );

  const canShowMoreEntries = visibleEntriesCount < filteredEntries.length;

  const latestEntry = changeLogEntries.length > 0 ? changeLogEntries[0] : null;

  useEffect(() => {
    setNotice(
      noticeChannel.notice
        ? {
            type: noticeChannel.notice.status,
            message: noticeChannel.notice.message,
            actionHref: noticeChannel.notice.actionHref,
            actionLabel: noticeChannel.notice.actionLabel,
          }
        : null,
    );
  }, [noticeChannel.notice]);

  const pushNotice = useCallback((next: ChangeNotice) => {
    setNotice(next);
    noticeChannel.publish({
      status: next.type,
      message: next.message,
      actionHref: next.actionHref,
      actionLabel: next.actionLabel,
      autoClearMs: 6000,
    });
  }, [noticeChannel]);

  const clearNotice = useCallback(() => {
    setNotice(null);
    noticeChannel.clear();
  }, [noticeChannel]);

  const clearEntryFeedback = useCallback(() => {
    if (entryFeedbackTimerRef.current !== null) {
      window.clearTimeout(entryFeedbackTimerRef.current);
      entryFeedbackTimerRef.current = null;
    }
    setEntryFeedback(null);
  }, []);

  // Success feedback auto-clears; errors stay until dismissed or replaced.
  const showEntryFeedback = useCallback((next: ChangeLogEntryFeedback) => {
    if (entryFeedbackTimerRef.current !== null) {
      window.clearTimeout(entryFeedbackTimerRef.current);
      entryFeedbackTimerRef.current = null;
    }
    setEntryFeedback(next);
    if (next.tone === "success") {
      entryFeedbackTimerRef.current = window.setTimeout(() => {
        entryFeedbackTimerRef.current = null;
        setEntryFeedback(null);
      }, 3000);
    }
  }, []);

  useEffect(
    () => () => {
      if (entryFeedbackTimerRef.current !== null) {
        window.clearTimeout(entryFeedbackTimerRef.current);
      }
    },
    [],
  );

  const handleArticleSelect = useCallback((value: string) => {
    setFilters((previous) => ({
      ...previous,
      articleSlug: value === "__all__" ? null : value,
    }));
  }, []);

  const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFilters((previous) => ({
      ...previous,
      searchQuery: value,
    }));
  }, []);

  const handleDateChange = useCallback(
    (field: "startDate" | "endDate") => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value.trim();
      setFilters((previous) => ({
        ...previous,
        [field]: value.length > 0 ? value : null,
      }));
    },
    [],
  );

  const applyQuickDateRange = useCallback((days: number | null) => {
    if (days === null) {
      setFilters((previous) => ({
        ...previous,
        startDate: null,
        endDate: null,
      }));
      return;
    }

    const now = new Date();
    const endValue = toLocalDateInputValue(now);
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    const startValue = toLocalDateInputValue(start);

    setFilters((previous) => ({
      ...previous,
      startDate: startValue,
      endDate: endValue,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(INITIAL_CHANGELOG_FILTERS);
  }, []);

  const focusArticleFilter = useCallback((slug: string) => {
    setFilters((previous) => ({
      ...previous,
      articleSlug: slug,
    }));
  }, []);

  const showMoreEntries = useCallback(() => {
    setVisibleEntriesCount((previous) => previous + CHANGELOG_VISIBLE_BATCH_SIZE);
  }, []);

  const handleCopyEntry = useCallback(
    async (entry: ChangeLogEntry) => {
      try {
        await navigator.clipboard.writeText(entry.markdown);
        showEntryFeedback({
          entryId: entry.id,
          tone: "success",
          message: "Diff copied to clipboard.",
        });
      } catch {
        showEntryFeedback({
          entryId: entry.id,
          tone: "danger",
          message: "Clipboard copy failed. Try downloading instead.",
        });
      }
    },
    [showEntryFeedback],
  );

  const handleDownloadEntry = useCallback(
    (entry: ChangeLogEntry) => {
      if (typeof window === "undefined") {
        return;
      }

      try {
        const primarySlug = entry.articles[0]?.slug ?? entry.id;
        const slug = toFileSlug(primarySlug || "entry");
        const timestamp = entry.createdAt.replace(/[:.]/g, "-");
        const fileName = `changelog-${slug}-${timestamp}.diff`;
        const blob = new Blob([entry.markdown], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        showEntryFeedback({
          entryId: entry.id,
          tone: "success",
          message: "Diff downloaded.",
        });
      } catch {
        showEntryFeedback({
          entryId: entry.id,
          tone: "danger",
          message: "Download failed. Try copying instead.",
        });
      }
    },
    [showEntryFeedback],
  );

  return {
    notice,
    feedWindow,
    totalEntriesCount: changeLogEntries.length,
    filters,
    articleOptions,
    articleFrequency,
    filteredEntries,
    visibleEntries,
    visibleEntriesCount,
    canShowMoreEntries,
    activeFilterCount,
    latestEntry,
    entryFeedback,
    clearEntryFeedback,
    filtersCardClassName: enableStickyPanels
      ? "w-full space-y-5 lg:sticky lg:top-24"
      : "w-full space-y-5",
    handleArticleSelect,
    handleSearchChange,
    handleDateChange,
    applyQuickDateRange,
    clearFilters,
    clearNotice,
    focusArticleFilter,
    pushNotice,
    showMoreEntries,
    handleCopyEntry,
    handleDownloadEntry,
  };
}
