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

export type ChangeNotice = {
  type: "success" | "error" | "pending";
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

export type ChangeLogFilters = {
  articleSlug: string | null;
  startDate: string | null;
  endDate: string | null;
  searchQuery: string;
};

type ChangeLogArticleOption = {
  slug: string;
  title: string;
};

export type ChangeLogController = {
  notice: ChangeNotice | null;
  totalEntriesCount: number;
  filters: ChangeLogFilters;
  articleOptions: ChangeLogArticleOption[];
  articleFrequency: ReturnType<typeof buildArticleFrequencyIndex>;
  filteredEntries: ChangeLogEntry[];
  activeFilterCount: number;
  latestEntry: ChangeLogEntry | null;
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
  handleCopyEntry: (entry: ChangeLogEntry) => Promise<void>;
  handleDownloadEntry: (entry: ChangeLogEntry) => void;
};

const INITIAL_CHANGELOG_FILTERS: ChangeLogFilters = {
  articleSlug: null,
  startDate: null,
  endDate: null,
  searchQuery: "",
};

const toFileSlug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function useDevModeChangeLog({
  changeLogEntries,
  enableStickyPanels,
}: {
  changeLogEntries: ChangeLogEntry[];
  enableStickyPanels: boolean;
}): ChangeLogController {
  const [notice, setNotice] = useState<ChangeNotice | null>(null);
  const [filters, setFilters] = useState<ChangeLogFilters>(INITIAL_CHANGELOG_FILTERS);
  const noticeTimeoutRef = useRef<number | null>(null);

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

  const normalizedRange = useMemo(() => {
    const start = filters.startDate
      ? Date.parse(`${filters.startDate}T00:00:00.000Z`)
      : null;
    const end = filters.endDate ? Date.parse(`${filters.endDate}T23:59:59.999Z`) : null;

    return {
      start: Number.isFinite(start) ? (start as number) : null,
      end: Number.isFinite(end) ? (end as number) : null,
    };
  }, [filters.endDate, filters.startDate]);

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

  const latestEntry = changeLogEntries.length > 0 ? changeLogEntries[0] : null;

  const pushNotice = useCallback((next: ChangeNotice) => {
    if (typeof window !== "undefined" && noticeTimeoutRef.current !== null) {
      window.clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
    }

    setNotice(next);

    if (typeof window !== "undefined") {
      noticeTimeoutRef.current = window.setTimeout(() => {
        setNotice(null);
        noticeTimeoutRef.current = null;
      }, 6000);
    }
  }, []);

  const clearNotice = useCallback(() => {
    if (typeof window !== "undefined" && noticeTimeoutRef.current !== null) {
      window.clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
    }
    setNotice(null);
  }, []);

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && noticeTimeoutRef.current !== null) {
        window.clearTimeout(noticeTimeoutRef.current);
        noticeTimeoutRef.current = null;
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
    const endValue = now.toISOString().slice(0, 10);
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startValue = start.toISOString().slice(0, 10);

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

  const handleCopyEntry = useCallback(
    async (entry: ChangeLogEntry) => {
      try {
        await navigator.clipboard.writeText(entry.markdown);
        pushNotice({ type: "success", message: "Entry diff copied to clipboard." });
      } catch {
        pushNotice({
          type: "error",
          message: "Clipboard copy failed. Try downloading instead.",
        });
      }
    },
    [pushNotice],
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
        pushNotice({ type: "success", message: "Entry diff downloaded." });
      } catch {
        pushNotice({ type: "error", message: "Download failed. Try copying instead." });
      }
    },
    [pushNotice],
  );

  return {
    notice,
    totalEntriesCount: changeLogEntries.length,
    filters,
    articleOptions,
    articleFrequency,
    filteredEntries,
    activeFilterCount,
    latestEntry,
    filtersCardClassName: enableStickyPanels
      ? "w-full space-y-5 bg-white/[0.04] md:sticky md:top-24"
      : "w-full space-y-5 bg-white/[0.04]",
    handleArticleSelect,
    handleSearchChange,
    handleDateChange,
    applyQuickDateRange,
    clearFilters,
    clearNotice,
    focusArticleFilter,
    pushNotice,
    handleCopyEntry,
    handleDownloadEntry,
  };
}
