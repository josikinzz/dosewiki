import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
  Wrench,
  Upload,
} from "lucide-react";
import {
  chemicalClassIndexGroups,
  dosageCategoryGroups,
  mechanismIndexGroups,
  substanceRecords,
} from "../../data/library";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import {
  appendChangeLogEntry,
  buildArticleFrequencyIndex,
  initialChangeLogEntries,
  sortChangeLogEntries,
  type ArticleFrequency,
  type ChangeLogEntry,
  type ChangeLogArticleSummary,
} from "../../data/changeLog";
import { buildArticleChangelog, buildDatasetChangelog } from "../../utils/changelog";
import { DiffPreview } from "../common/DiffPreview";
import { useArticleDraftForm } from "../../hooks/useArticleDraftForm";
import {
  ArticleDraftForm,
  ArticleDraftPayload,
  buildArticleFromDraft,
  createEmptyArticleDraftForm,
  hydrateArticleDraftForm,
} from "../../utils/articleDraftForm";
import { slugify } from "../../utils/slug";
import { useDevMode } from "../dev/DevModeContext";
import { DevCommitCard } from "../dev/DevCommitCard";
import { TagEditorTab } from "../dev/TagEditorTab";
import { ProfileEditorTab } from "../dev/ProfileEditorTab";
import { JsonEditor } from "../common/JsonEditor";
import { SectionCard } from "../common/SectionCard";
import { ArticleDraftFormFields } from "../sections/ArticleDraftFormFields";
import { getProfileByKey, updateProfileCache } from "../../data/userProfiles";
import type { NormalizedUserProfile } from "../../data/userProfiles";

type ChangeNotice = {
  type: "success" | "error";
  message: string;
};

type ChangeLogFilters = {
  articleSlug: string | null;
  startDate: string | null;
  endDate: string | null;
  searchQuery: string;
};

type DevModeTab = "edit" | "create" | "change-log" | "tag-editor" | "profile";

type DevModePageProps = {
  activeTab: DevModeTab;
  onTabChange: (tab: DevModeTab) => void;
};

const baseInputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-[16px] text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";
const baseSelectClass =
  "w-full appearance-none rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 pr-12 text-sm text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";
const compactSelectClass =
  "w-full appearance-none rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 pr-10 text-xs text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";
const dangerButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-rose-500/50 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60";
const MAX_ARTICLE_HISTORY_ENTRIES = 5;
const PASSWORD_STORAGE_KEY = "dosewiki-dev-password";

const classificationOptions = [
  { value: "psychoactive", label: "Psychoactive class" },
  { value: "chemical", label: "Chemical class" },
  { value: "mechanism", label: "Mechanism of action class" },
] as const;

type ClassificationView = (typeof classificationOptions)[number]["value"];

type StoredCredentialsRecord = {
  username: string;
  password: string;
  key?: string;
  lastVerifiedAt?: string;
};

const formatArticleLabel = (article: unknown, index: number) => {
  if (!article || typeof article !== "object") {
    return `Article ${index + 1}`;
  }

  const record = article as { title?: string; id?: number };
  const parts: string[] = [];
  if (typeof record.title === "string" && record.title.trim().length > 0) {
    parts.push(record.title.trim());
  }

  if (typeof record.id === "number") {
    parts.push(`#${record.id}`);
  }

  if (parts.length === 0) {
    return `Article ${index + 1}`;
  }

  return parts.join(" · ");
};

const toFileSlug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const mergeArticleWithOriginal = (original: unknown, draft: ArticleDraftPayload) => {
  if (!original || typeof original !== "object") {
    return { ...draft };
  }

  const originalRecord = original as Record<string, unknown>;
  const originalDrugInfo =
    originalRecord.drug_info && typeof originalRecord.drug_info === "object"
      ? (originalRecord.drug_info as Record<string, unknown>)
      : {};

  const mergedDrugInfo = {
    ...originalDrugInfo,
    ...draft.drug_info,
    dosages: {
      ...(typeof originalDrugInfo.dosages === "object" && originalDrugInfo.dosages !== null
        ? (originalDrugInfo.dosages as Record<string, unknown>)
        : {}),
      routes_of_administration: draft.drug_info.dosages.routes_of_administration,
    },
    duration: {
      ...(typeof originalDrugInfo.duration === "object" && originalDrugInfo.duration !== null
        ? (originalDrugInfo.duration as Record<string, unknown>)
        : {}),
      ...draft.drug_info.duration,
    },
    tolerance: {
      ...(typeof originalDrugInfo.tolerance === "object" && originalDrugInfo.tolerance !== null
        ? (originalDrugInfo.tolerance as Record<string, unknown>)
        : {}),
      ...draft.drug_info.tolerance,
    },
    interactions: {
      ...(typeof originalDrugInfo.interactions === "object" && originalDrugInfo.interactions !== null
        ? (originalDrugInfo.interactions as Record<string, unknown>)
        : {}),
      ...draft.drug_info.interactions,
    },
    citations: draft.drug_info.citations,
  };

  const merged: Record<string, unknown> = {
    ...originalRecord,
    ...draft,
    drug_info: mergedDrugInfo,
  };

  delete merged.content;

  if (draft.id === undefined && originalRecord.id !== undefined) {
    merged.id = originalRecord.id;
  }

  return merged;
};

const extractChangeLogSummary = (record: unknown, index: number): ChangeLogArticleSummary | null => {
  if (!record || typeof record !== "object") {
    return null;
  }

  const entry = record as {
    id?: unknown;
    title?: unknown;
    drug_info?: {
      drug_name?: unknown;
    };
  };

  const rawId = entry.id;
  let idValue: number | null = null;
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    idValue = rawId;
  } else if (typeof rawId === "string" && rawId.trim().length > 0) {
    const parsed = Number.parseInt(rawId.trim(), 10);
    if (Number.isFinite(parsed)) {
      idValue = parsed;
    }
  }

  if (idValue === null) {
    return null;
  }

  const rawTitle = typeof entry.title === "string" ? entry.title.trim() : "";
  const drugName = typeof entry.drug_info?.drug_name === "string" ? entry.drug_info.drug_name.trim() : "";

  const title = rawTitle || drugName || `Article ${index + 1}`;
  const slugSource = drugName || title || `article-${idValue}`;
  const slug = slugify(slugSource) || `article-${idValue}`;

  return {
    id: idValue,
    title,
    slug,
  };
};

export function DevModePage({ activeTab, onTabChange }: DevModePageProps) {
  const {
    articles,
    close,
    updateArticleAt,
    resetArticleAt,
    resetAll,
    getOriginalArticle,
    replaceArticles,
    applyArticlesTransform,
  } = useDevMode();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [classificationView, setClassificationView] = useState<ClassificationView>("psychoactive");
  const [editorValue, setEditorValue] = useState("{}");
  const [notice, setNotice] = useState<ChangeNotice | null>(null);
  const [articleDeleteConfirmed, setArticleDeleteConfirmed] = useState(false);
  const [articleDeleteNotice, setArticleDeleteNotice] = useState<ChangeNotice | null>(null);
  const [isDeletingArticle, setIsDeletingArticle] = useState(false);
  const [draftMode, setDraftMode] = useState<"ui" | "json">("ui");
  const [creatorNotice, setCreatorNotice] = useState<ChangeNotice | null>(null);
  const [isNewArticleStaged, setIsNewArticleStaged] = useState(false);
  const [stagedArticleLabel, setStagedArticleLabel] = useState<string | null>(null);
  const [stagedArticleId, setStagedArticleId] = useState<number | null>(null);
  const handleCreatorMutate = useCallback(() => {
    setCreatorNotice(null);
    setIsNewArticleStaged(false);
    setStagedArticleLabel(null);
    setStagedArticleId(null);
  }, [setCreatorNotice, setIsNewArticleStaged, setStagedArticleLabel, setStagedArticleId]);
  const newArticleController = useArticleDraftForm({
    initialState: createEmptyArticleDraftForm(),
    onMutate: handleCreatorMutate,
  });
  const {
    form: newArticleForm,
    resetForm: resetNewArticleFormState,
    replaceForm: replaceNewArticleForm,
  } = newArticleController;
  const [username, setUsername] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<ChangeNotice | null>(null);
  const [passwordKey, setPasswordKey] = useState<string | null>(null);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isVerifyingCredentials, setIsVerifyingCredentials] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [githubNotice, setGithubNotice] = useState<ChangeNotice | null>(null);
  const [changeLogNotice, setChangeLogNotice] = useState<ChangeNotice | null>(null);
  const [changeLogEntries, setChangeLogEntries] = useState<ChangeLogEntry[]>(() =>
    sortChangeLogEntries(initialChangeLogEntries),
  );
  const [changeLogFilters, setChangeLogFilters] = useState<ChangeLogFilters>({
    articleSlug: null,
    startDate: null,
    endDate: null,
    searchQuery: "",
  });
  const passwordNoticeTimeoutRef = useRef<number | null>(null);
  const changeLogNoticeTimeoutRef = useRef<number | null>(null);
  const previousArticleIndexRef = useRef<number | null>(null);
  const profileVerifyAttemptRef = useRef(false);

  const selectedArticle = useMemo(() => articles[selectedIndex], [articles, selectedIndex]);
  const originalArticle = useMemo(() => getOriginalArticle(selectedIndex), [getOriginalArticle, selectedIndex]);
  const selectedArticleSummary = useMemo(() => {
    return (
      extractChangeLogSummary(selectedArticle, selectedIndex) ??
      extractChangeLogSummary(originalArticle, selectedIndex)
    );
  }, [originalArticle, selectedArticle, selectedIndex]);
  const selectedArticleSlug = selectedArticleSummary?.slug ?? null;
  const hydratedSelectedForm = useMemo(() => hydrateArticleDraftForm(selectedArticle), [selectedArticle]);
  const handleEditArticleMutate = useCallback(() => {
    setNotice(null);
  }, [setNotice]);
  const editArticleController = useArticleDraftForm({
    initialState: hydratedSelectedForm,
    onMutate: handleEditArticleMutate,
  });
  const {
    form: editArticleForm,
    replaceForm: replaceEditArticleForm,
  } = editArticleController;
  const draftState = useMemo(() => {
    try {
      return { value: JSON.parse(editorValue) as unknown, isValid: true };
    } catch {
      return { value: null, isValid: false };
    }
  }, [editorValue]);
  const { value: draftValue, isValid: isDraftValid } = draftState;
  const hasInvalidJsonDraft = draftMode === "json" && !isDraftValid;
  const comparisonTarget = isDraftValid ? draftValue : selectedArticle;
  const articleLabel = useMemo(() => {
    const labelSource = isDraftValid ? draftValue : selectedArticle;
    if (!labelSource || typeof labelSource !== "object") {
      return `Article ${selectedIndex + 1}`;
    }
    return formatArticleLabel(labelSource, selectedIndex);
  }, [draftValue, isDraftValid, selectedArticle, selectedIndex]);
  const changelogResult = useMemo(() => {
    if (!originalArticle) {
      return {
        markdown: `# ${articleLabel}\n\nNo source article available for comparison.\n`,
        hasChanges: false,
      };
    }
    if (!isDraftValid) {
      return {
        markdown: `# ${articleLabel}\n\nUnable to generate diff: current editor JSON is invalid.\n`,
        hasChanges: false,
      };
    }
    if (comparisonTarget === undefined) {
      return {
        markdown: `# ${articleLabel}\n\nNo comparison data available.\n`,
        hasChanges: false,
      };
    }

    return buildArticleChangelog(articleLabel, originalArticle, comparisonTarget);
  }, [articleLabel, comparisonTarget, isDraftValid, originalArticle]);

  const changelogMarkdown = changelogResult.markdown;
  const datasetChangelog = useMemo(
    () =>
      buildDatasetChangelog({
        articles,
        getOriginalArticle,
        formatHeading: (article, index) => formatArticleLabel(article ?? articles[index], index),
        summarizeArticle: (article, index) =>
          extractChangeLogSummary(article, index) ??
          extractChangeLogSummary(articles[index], index) ??
          extractChangeLogSummary(getOriginalArticle(index), index),
      }),
    [articles, getOriginalArticle],
  );
  const hasDatasetChanges = datasetChangelog.sections.length > 0 && datasetChangelog.markdown.trim().length > 0;
  const trimmedUsername = username.trim();
  const trimmedAdminPassword = adminPassword.trim();
  const canonicalProfileKey =
    typeof passwordKey === "string" && passwordKey.trim().length > 0
      ? passwordKey.trim().toUpperCase()
      : trimmedUsername.length > 0
        ? trimmedUsername.toUpperCase()
        : "";
  const verifiedBadgeText = useMemo(() => {
    if (!lastVerifiedAt) {
      return null;
    }

    const parsed = new Date(lastVerifiedAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [lastVerifiedAt]);
  const [profileData, setProfileData] = useState(() => getProfileByKey(canonicalProfileKey));

  useEffect(() => {
    setProfileData(getProfileByKey(canonicalProfileKey));
  }, [canonicalProfileKey]);

  const profileHistory = useMemo(() => {
    if (!canonicalProfileKey) {
      return [] as ChangeLogEntry[];
    }

    return changeLogEntries
      .filter((entry) => (entry.submittedBy ?? "").toUpperCase() === canonicalProfileKey)
      .slice(0, 6);
  }, [canonicalProfileKey, changeLogEntries]);

  const hasStoredCredentials = trimmedUsername.length > 0 && trimmedAdminPassword.length > 0;
  const isCommitDisabled =
    isSaving || !hasStoredCredentials || hasInvalidJsonDraft;
  const isCreateCommitDisabled = isCommitDisabled || !isNewArticleStaged;
  const newArticlePayload = useMemo(() => buildArticleFromDraft(newArticleForm), [newArticleForm]);
  const newArticleJson = useMemo(() => JSON.stringify(newArticlePayload, null, 2), [newArticlePayload]);
  const isNewArticleValid = useMemo(() => {
    const hasTitle = newArticleForm.title.trim().length > 0;
    const hasDrugName = newArticleForm.drugName.trim().length > 0;
    const hasRoute = newArticleForm.routes.some(
      (route) => route.route.trim().length > 0 && route.units.trim().length > 0,
    );

    return hasTitle && hasDrugName && hasRoute;
  }, [newArticleForm]);
  const previewMinHeight = useMemo(() => {
    const lines = newArticleJson.split("\n").length;
    return Math.min(480, Math.max(160, lines * 18));
  }, [newArticleJson]);
  const nextAvailableArticleId = useMemo(() => {
    const highestId = articles.reduce((max, record) => {
      if (!record) {
        return max;
      }

      let candidate: number | null = null;
      if (typeof record.id === "number") {
        candidate = record.id;
      } else if (typeof record.id === "string") {
        const parsed = Number.parseInt(record.id, 10);
        candidate = Number.isFinite(parsed) ? parsed : null;
      }

      return candidate !== null && Number.isFinite(candidate) ? Math.max(max, candidate) : max;
    }, 0);

    return highestId + 1;
  }, [articles]);

  const articleOptions = useMemo(
    () =>
      articles
        .map((article, index) => ({
          index,
          label: formatArticleLabel(article, index),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [articles],
  );
  const hasArticles = articleOptions.length > 0;
  const articleDeleteTargetLabel = selectedArticleSummary?.title ?? articleLabel;

  const articleFrequency = useMemo(() => buildArticleFrequencyIndex(changeLogEntries), [changeLogEntries]);

  const selectedArticleHistoryTotal = useMemo(() => {
    if (!selectedArticleSlug) {
      return 0;
    }

    const frequency = articleFrequency.find((entry) => entry.slug === selectedArticleSlug);
    return frequency?.count ?? 0;
  }, [articleFrequency, selectedArticleSlug]);

  const selectedArticleHistory = useMemo(() => {
    if (!selectedArticleSlug) {
      return [] as ChangeLogEntry[];
    }

    return changeLogEntries
      .filter((entry) => entry.articles.some((article) => article.slug === selectedArticleSlug))
      .slice(0, MAX_ARTICLE_HISTORY_ENTRIES);
  }, [changeLogEntries, selectedArticleSlug]);

  const changeLogArticleOptions = useMemo(() => {
    const map = new Map<string, { slug: string; title: string }>();
    changeLogEntries.forEach((entry) => {
      entry.articles.forEach((article) => {
        if (!map.has(article.slug)) {
          map.set(article.slug, { slug: article.slug, title: article.title });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }, [changeLogEntries]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(PASSWORD_STORAGE_KEY);
      if (typeof storedValue === "string") {
        let parsedUsername = "";
        let parsedPassword = "";
        let parsedKey: string | null = null;
        let parsedVerifiedAt: string | null = null;

        try {
          const parsed = JSON.parse(storedValue);
          if (parsed && typeof parsed === "object") {
            const candidateUsername = typeof parsed.username === "string" ? parsed.username.trim() : "";
            const candidatePassword = typeof parsed.password === "string" ? parsed.password.trim() : "";
            parsedUsername = candidateUsername;
            parsedPassword = candidatePassword;
            if (typeof (parsed as StoredCredentialsRecord).key === "string") {
              const candidateKey = ((parsed as StoredCredentialsRecord).key ?? "").trim();
              if (candidateKey.length > 0) {
                parsedKey = candidateKey;
              }
            }
            if (typeof (parsed as StoredCredentialsRecord).lastVerifiedAt === "string") {
              const candidateTimestamp = ((parsed as StoredCredentialsRecord).lastVerifiedAt ?? "").trim();
              if (candidateTimestamp.length > 0 && !Number.isNaN(Date.parse(candidateTimestamp))) {
                parsedVerifiedAt = candidateTimestamp;
              }
            }
          }
        } catch {
          // Legacy password-only value; handle below.
        }

        if (!parsedPassword) {
          const legacyPassword = storedValue.trim();
          parsedPassword = legacyPassword;
        }

        setUsername(parsedUsername);
        setUsernameDraft(parsedUsername);
        setAdminPassword(parsedPassword);
        setPasswordDraft(parsedPassword);
        setPasswordKey(parsedKey);
        setLastVerifiedAt(parsedVerifiedAt);
        setIsPasswordVisible(false);
      }
    } catch {
      // Ignore storage errors; manual entry still works.
    }
  }, []);

  const normalizedRange = useMemo(() => {
    const start = changeLogFilters.startDate
      ? Date.parse(`${changeLogFilters.startDate}T00:00:00.000Z`)
      : null;
    const end = changeLogFilters.endDate ? Date.parse(`${changeLogFilters.endDate}T23:59:59.999Z`) : null;

    return {
      start: Number.isFinite(start) ? (start as number) : null,
      end: Number.isFinite(end) ? (end as number) : null,
    };
  }, [changeLogFilters.endDate, changeLogFilters.startDate]);

  const filteredChangeLogEntries = useMemo(() => {
    const query = changeLogFilters.searchQuery.trim().toLowerCase();

    return changeLogEntries.filter((entry) => {
      const entryTimestamp = Date.parse(entry.createdAt);
      if (normalizedRange.start !== null && entryTimestamp < normalizedRange.start) {
        return false;
      }
      if (normalizedRange.end !== null && entryTimestamp > normalizedRange.end) {
        return false;
      }

      if (changeLogFilters.articleSlug) {
        const matchesArticle = entry.articles.some((article) => article.slug === changeLogFilters.articleSlug);
        if (!matchesArticle) {
          return false;
        }
      }

      if (query.length > 0) {
        const commitMessage = (entry.commit?.message ?? "").toLowerCase();
        const markdown = entry.markdown.toLowerCase();
        const articleMatch = entry.articles.some((article) =>
          article.title.toLowerCase().includes(query) || article.slug.toLowerCase().includes(query),
        );

        if (!commitMessage.includes(query) && !markdown.includes(query) && !articleMatch) {
          return false;
        }
      }

      return true;
    });
  }, [changeLogEntries, changeLogFilters.articleSlug, changeLogFilters.searchQuery, normalizedRange]);

  const activeChangeLogFilterCount = useMemo(() => {
    let count = 0;
    if (changeLogFilters.articleSlug) {
      count += 1;
    }
    if (changeLogFilters.startDate) {
      count += 1;
    }
    if (changeLogFilters.endDate) {
      count += 1;
    }
    if (changeLogFilters.searchQuery.trim().length > 0) {
      count += 1;
    }
    return count;
  }, [changeLogFilters]);

  const latestChangeLogEntry = changeLogEntries.length > 0 ? changeLogEntries[0] : null;

  const handleChangeLogArticleSelect = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setChangeLogFilters((previous) => ({
        ...previous,
        articleSlug: value === "" ? null : value,
      }));
    },
    [],
  );

  const handleChangeLogSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setChangeLogFilters((previous) => ({
      ...previous,
      searchQuery: value,
    }));
  }, []);

  const handleChangeLogDateChange = useCallback(
    (field: "startDate" | "endDate") => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value.trim();
      setChangeLogFilters((previous) => ({
        ...previous,
        [field]: value.length > 0 ? value : null,
      }));
    },
    [],
  );

  const applyQuickDateRange = useCallback((days: number | null) => {
    if (days === null) {
      setChangeLogFilters((previous) => ({
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

    setChangeLogFilters((previous) => ({
      ...previous,
      startDate: startValue,
      endDate: endValue,
    }));
  }, []);

  const clearChangeLogFilters = useCallback(() => {
    setChangeLogFilters({ articleSlug: null, startDate: null, endDate: null, searchQuery: "" });
  }, []);

  const focusArticleFilter = useCallback((slug: string) => {
    setChangeLogFilters((previous) => ({
      ...previous,
      articleSlug: slug,
    }));
  }, []);

  const showPasswordNotice = useCallback(
    (next: ChangeNotice) => {
      if (typeof window !== "undefined" && passwordNoticeTimeoutRef.current !== null) {
        window.clearTimeout(passwordNoticeTimeoutRef.current);
        passwordNoticeTimeoutRef.current = null;
      }
      setPasswordNotice(next);
      if (typeof window !== "undefined") {
        passwordNoticeTimeoutRef.current = window.setTimeout(() => {
          setPasswordNotice(null);
          passwordNoticeTimeoutRef.current = null;
        }, 4000);
      }
    },
    [],
  );

  const persistCredentialsToLocalStorage = useCallback(
    (record: { username: string; password: string; key: string; lastVerifiedAt: string }) => {
      if (typeof window === "undefined") {
        return false;
      }

      try {
        const payload: StoredCredentialsRecord = {
          username: record.username,
          password: record.password,
          key: record.key,
          lastVerifiedAt: record.lastVerifiedAt,
        };
        window.localStorage.setItem(PASSWORD_STORAGE_KEY, JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const verifyDevCredentials = useCallback(
    async (options: {
      username?: string;
      password?: string;
      persist?: boolean;
      showStorageError?: boolean;
      syncDraftInputs?: boolean;
    } = {}) => {
      const candidateUsername = (options.username ?? username).trim();
      const candidatePassword = (options.password ?? adminPassword).trim();

      if (!candidateUsername || !candidatePassword) {
        const message = "Save your username and password above before continuing.";
        showPasswordNotice({ type: "error", message });
        throw new Error(message);
      }

      try {
        const authResponse = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: candidateUsername, password: candidatePassword }),
        });

        const authPayload = await authResponse.json().catch(() => ({}));
        if (!authResponse.ok || authPayload.authorized !== true) {
          const reason = typeof authPayload.error === "string" ? authPayload.error : "Authentication failed.";
          throw new Error(reason);
        }

        const matchedKey =
          typeof authPayload.key === "string" && authPayload.key.trim().length > 0
            ? authPayload.key.trim()
            : candidateUsername;

        const verifiedAt = new Date().toISOString();

        setPasswordKey(matchedKey);
        setLastVerifiedAt(verifiedAt);
        setUsername(candidateUsername);
        setAdminPassword(candidatePassword);

        if (options.username !== undefined || options.password !== undefined || options.syncDraftInputs) {
          setUsernameDraft(candidateUsername);
          setPasswordDraft(candidatePassword);
        }

        const shouldPersist = options.persist ?? true;
        let noticeMessage = `Logged in as ${matchedKey}.`;
        if (shouldPersist) {
          const persisted = persistCredentialsToLocalStorage({
            username: candidateUsername,
            password: candidatePassword,
            key: matchedKey,
            lastVerifiedAt: verifiedAt,
          });

          if (!persisted) {
            if (options.showStorageError) {
              noticeMessage = "Verified for this session, but local storage is unavailable.";
            }
          }
        }

        showPasswordNotice({ type: "success", message: noticeMessage });

        return {
          username: candidateUsername,
          password: candidatePassword,
          key: matchedKey,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Authentication failed.";
        showPasswordNotice({ type: "error", message: reason });
        throw new Error(reason);
      }
    },
    [adminPassword, persistCredentialsToLocalStorage, showPasswordNotice, username],
  );

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && passwordNoticeTimeoutRef.current !== null) {
        window.clearTimeout(passwordNoticeTimeoutRef.current);
        passwordNoticeTimeoutRef.current = null;
      }
    },
    [],
  );

  const handleLogout = useCallback(() => {
    setUsername("");
    setUsernameDraft("");
    setAdminPassword("");
    setPasswordDraft("");
    setPasswordKey(null);
    setLastVerifiedAt(null);
    setIsPasswordVisible(false);
    setIsVerifyingCredentials(false);
    profileVerifyAttemptRef.current = false;

    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(PASSWORD_STORAGE_KEY);
        showPasswordNotice({ type: "success", message: "Logged out and cleared saved credentials." });
        return;
      } catch {
        // Fall through to session-only notice below.
      }
    }

    showPasswordNotice({
      type: "success",
      message: "Logged out for this session. Clear local storage manually to remove saved credentials.",
    });
  }, [showPasswordNotice]);

  const handleCredentialsSave = useCallback(
    async (event?: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>) => {
      if (event && "preventDefault" in event) {
        event.preventDefault();
      }

      const trimmedUsernameDraft = usernameDraft.trim();
      const trimmedPasswordDraft = passwordDraft.trim();

      setUsernameDraft(trimmedUsernameDraft);
      setPasswordDraft(trimmedPasswordDraft);

      if (trimmedUsernameDraft.length === 0 && trimmedPasswordDraft.length === 0) {
        handleLogout();
        return;
      }

      if (trimmedUsernameDraft.length === 0 || trimmedPasswordDraft.length === 0) {
        showPasswordNotice({ type: "error", message: "Enter both username and password before saving." });
        return;
      }

      setIsVerifyingCredentials(true);
      try {
        await verifyDevCredentials({
          username: trimmedUsernameDraft,
          password: trimmedPasswordDraft,
          showStorageError: true,
          syncDraftInputs: true,
        });
        setIsPasswordVisible(false);
      } catch {
        // Verification errors are handled through notices.
      } finally {
        setIsVerifyingCredentials(false);
      }
    },
    [handleLogout, passwordDraft, showPasswordNotice, usernameDraft, verifyDevCredentials],
  );

  const handleCredentialInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleCredentialsSave();
      }
    },
    [handleCredentialsSave],
  );

  const pushChangeLogNotice = useCallback(
    (next: ChangeNotice) => {
      if (typeof window !== "undefined" && changeLogNoticeTimeoutRef.current !== null) {
        window.clearTimeout(changeLogNoticeTimeoutRef.current);
        changeLogNoticeTimeoutRef.current = null;
      }
      setChangeLogNotice(next);
      if (typeof window !== "undefined") {
        changeLogNoticeTimeoutRef.current = window.setTimeout(() => {
          setChangeLogNotice(null);
          changeLogNoticeTimeoutRef.current = null;
        }, 6000);
      }
    },
    [],
  );

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && changeLogNoticeTimeoutRef.current !== null) {
        window.clearTimeout(changeLogNoticeTimeoutRef.current);
        changeLogNoticeTimeoutRef.current = null;
      }
    },
    [],
  );

  const handleCopyChangeLogEntry = useCallback(
    async (entry: ChangeLogEntry) => {
      try {
        await navigator.clipboard.writeText(entry.markdown);
        pushChangeLogNotice({ type: "success", message: "Entry diff copied to clipboard." });
      } catch {
        pushChangeLogNotice({ type: "error", message: "Clipboard copy failed. Try downloading instead." });
      }
    },
    [pushChangeLogNotice],
  );

  const handleDownloadChangeLogEntry = useCallback(
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
        pushChangeLogNotice({ type: "success", message: "Entry diff downloaded." });
      } catch {
        pushChangeLogNotice({ type: "error", message: "Download failed. Try copying instead." });
      }
    },
    [pushChangeLogNotice],
  );

  const articleIndexById = useMemo(() => {
    const map = new Map<number, number>();
    articles.forEach((article, index) => {
      if (article && typeof article.id === "number") {
        map.set(article.id, index);
      }
    });
    return map;
  }, [articles]);

  const titleToIndex = useMemo(() => {
    const map = new Map<string, number>();
    articles.forEach((article, index) => {
      const title = typeof article?.title === "string" ? article.title.trim().toLowerCase() : undefined;
      if (title && !map.has(title)) {
        map.set(title, index);
      }
    });
    return map;
  }, [articles]);

  const slugToArticleIndex = useMemo(() => {
    const map = new Map<string, number>();
    substanceRecords.forEach((record) => {
      if (!record.slug) {
        return;
      }

      if (record.id !== null) {
        const index = articleIndexById.get(record.id);
        if (index !== undefined) {
          map.set(record.slug, index);
          return;
        }
      }

      const fallbackTitle = record.name.trim().toLowerCase();
      const fallbackIndex = titleToIndex.get(fallbackTitle);
      if (fallbackIndex !== undefined) {
        map.set(record.slug, fallbackIndex);
      }
    });
    return map;
  }, [articleIndexById, titleToIndex]);

  const categoryDropdowns = useMemo(() => {
    const groups =
      classificationView === "psychoactive"
        ? dosageCategoryGroups
        : classificationView === "chemical"
          ? chemicalClassIndexGroups
          : mechanismIndexGroups;

    return groups
      .map((group) => {
        const options = group.drugs
          .map((drug) => {
            const index = slugToArticleIndex.get(drug.slug);
            if (index === undefined) {
              return null;
            }
            const label = drug.alias ? `${drug.name} (${drug.alias})` : drug.name;
            return { index, label };
          })
          .filter((option): option is { index: number; label: string } => option !== null)
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

        return {
          key: group.key,
          name: group.name,
          options,
        };
      })
      .filter((group) => group.options.length > 0);
  }, [classificationView, slugToArticleIndex]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (articles.length === 0) {
        return 0;
      }
      const maxIndex = articles.length - 1;
      if (current < 0) {
        return 0;
      }
      if (current > maxIndex) {
        return maxIndex;
      }
      return current;
    });
  }, [articles.length]);

  useEffect(() => {
    setArticleDeleteConfirmed(false);
  }, [selectedIndex]);

  useEffect(() => {
    replaceEditArticleForm(hydratedSelectedForm, { emitMutate: false });
    if (!selectedArticle) {
      setEditorValue("{}");
    } else {
      setEditorValue(JSON.stringify(selectedArticle, null, 2));
    }
    setDraftMode("ui");
    if (previousArticleIndexRef.current !== selectedIndex) {
      setNotice(null);
    }
    previousArticleIndexRef.current = selectedIndex;
  }, [hydratedSelectedForm, replaceEditArticleForm, selectedArticle, selectedIndex]);

  useEffect(() => {
    if (draftMode !== "ui") {
      return;
    }

    const draftPayload = buildArticleFromDraft(editArticleForm);
    const merged = mergeArticleWithOriginal(selectedArticle, draftPayload);
    setEditorValue(JSON.stringify(merged, null, 2));
  }, [draftMode, editArticleForm, selectedArticle]);

  const switchToJsonMode = useCallback(() => {
    if (draftMode === "json") {
      return;
    }

    const draftPayload = buildArticleFromDraft(editArticleForm);
    const merged = mergeArticleWithOriginal(selectedArticle, draftPayload);
    setEditorValue(JSON.stringify(merged, null, 2));
    setDraftMode("json");
    setNotice(null);
  }, [draftMode, editArticleForm, selectedArticle]);

  const switchToUiMode = useCallback(() => {
    if (draftMode === "ui") {
      return;
    }

    try {
      const parsed = JSON.parse(editorValue);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Parsed data must be an object");
      }

      const hydrated = hydrateArticleDraftForm(parsed);
      replaceEditArticleForm(hydrated, { emitMutate: false });
      setDraftMode("ui");
      setNotice(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to parse JSON.";
      setNotice({ type: "error", message: `Switch failed: ${reason}` });
    }
  }, [draftMode, editorValue, replaceEditArticleForm]);

  const handleEditorChange = useCallback(
    (value: string) => {
      setEditorValue(value);
      if (draftMode === "json") {
        setNotice(null);
      }
    },
    [draftMode],
  );

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [close]);

  const applyEdits = () => {
    if (!selectedArticle) {
      setNotice({ type: "error", message: "Select an article before saving." });
      return;
    }

    if (hasInvalidJsonDraft) {
      setNotice({ type: "error", message: "Fix JSON syntax before saving." });
      return;
    }

    if (draftMode === "ui") {
      const draftPayload = buildArticleFromDraft(editArticleForm);
      const merged = mergeArticleWithOriginal(selectedArticle, draftPayload);
      updateArticleAt(selectedIndex, merged);
      setNotice({ type: "success", message: "Article updated in draft dataset." });
      return;
    }

    try {
      const parsed = JSON.parse(editorValue);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Parsed data must be an object");
      }

      updateArticleAt(selectedIndex, parsed);
      setNotice({ type: "success", message: "Article updated in draft dataset." });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to parse JSON.";
      setNotice({ type: "error", message: reason });
    }
  };

  const resetArticle = () => {
    resetArticleAt(selectedIndex);
    const original = getOriginalArticle(selectedIndex);
    const hydrated = hydrateArticleDraftForm(original);
    replaceEditArticleForm(hydrated, { emitMutate: false });
    if (original) {
      setEditorValue(JSON.stringify(original, null, 2));
    } else {
      setEditorValue("{}");
    }
    setDraftMode("ui");
    setNotice({ type: "success", message: "Article reset to original content." });
  };

  const resetDataset = () => {
    resetAll();
    setSelectedIndex(0);
    const first = getOriginalArticle(0);
    if (first) {
      setEditorValue(JSON.stringify(first, null, 2));
    }
    replaceEditArticleForm(hydrateArticleDraftForm(first), { emitMutate: false });
    setDraftMode("ui");
    setNotice({ type: "success", message: "All articles restored." });
  };

  const downloadDraft = () => {
    setNotice(null);
    const fileName = `articles-dev-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const payload = JSON.stringify(articles, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setNotice({ type: "success", message: "Draft dataset downloaded." });
  };

  const downloadArticle = () => {
    if (hasInvalidJsonDraft) {
      setNotice({ type: "error", message: "Fix JSON syntax before downloading the article." });
      return;
    }

    const article = draftValue !== null && draftValue !== undefined ? draftValue : selectedArticle;
    if (article === undefined) {
      setNotice({ type: "error", message: "Select an article before downloading." });
      return;
    }

    setNotice(null);
    const label = articleLabel;
    const slug = toFileSlug(label || "article");
    const fileName = `article-${slug || "record"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const payload = JSON.stringify(article, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setNotice({ type: "success", message: "Selected article downloaded." });
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(articles, null, 2));
      setNotice({ type: "success", message: "Draft JSON copied to clipboard." });
    } catch {
      setNotice({ type: "error", message: "Clipboard copy failed. Try downloading instead." });
    }
  };

  const copyChangelog = async () => {
    try {
      await navigator.clipboard.writeText(changelogMarkdown);
      setNotice({ type: "success", message: "Diff copied to clipboard." });
    } catch {
      setNotice({ type: "error", message: "Clipboard copy failed. Try downloading instead." });
    }
  };

  const downloadChangelog = () => {
    setNotice(null);
    const slug = toFileSlug(articleLabel || "article");
    const fileName = `changelog-${slug || "record"}-${new Date().toISOString().replace(/[:.]/g, "-")}.diff`;
    const blob = new Blob([changelogMarkdown], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setNotice({ type: "success", message: "Diff file downloaded." });
  };

  const handleSaveToGitHub = useCallback(async () => {
    if (hasInvalidJsonDraft) {
      setGithubNotice({ type: "error", message: "Fix JSON syntax before committing." });
      return;
    }

    const commitMessage = `Dev editor update - ${new Date().toLocaleString()}`;

    try {
      setIsSaving(true);
      setGithubNotice({ type: "success", message: "Verifying credentials…" });

      const credentials = await verifyDevCredentials();

      setGithubNotice({
        type: "success",
        message: `Credentials verified for ${credentials.key}. Saving to GitHub…`,
      });

      const saveResponse = await fetch("/api/save-articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
          articlesData: articles,
          commitMessage,
          changelogMarkdown: datasetChangelog.markdown,
          changedArticles: datasetChangelog.articles,
        }),
      });

      const result = await saveResponse.json().catch(() => ({}));

      if (!saveResponse.ok) {
        throw new Error(result.details || result.error || "Save failed.");
      }

      const resolvedKey =
        typeof result.submittedBy === "string" && result.submittedBy.trim().length > 0
          ? result.submittedBy.trim()
          : credentials.key;
      setPasswordKey(resolvedKey);

      const commitNotice = result.commitUrl ? `Saved to GitHub. Commit → ${result.commitUrl}` : "Saved to GitHub.";
      setGithubNotice({ type: "success", message: commitNotice });

      if (result.entry && typeof result.entry === "object") {
        const entry = result.entry as ChangeLogEntry;
        const sanitizedEntry: ChangeLogEntry = {
          ...entry,
          commit: {
            sha: entry.commit?.sha ?? "",
            url: entry.commit?.url ?? "",
            message: entry.commit?.message ?? commitMessage,
          },
          submittedBy: entry.submittedBy ?? resolvedKey,
        };
        setChangeLogEntries((previous) => appendChangeLogEntry(previous, sanitizedEntry));
        onTabChange("change-log");
        pushChangeLogNotice({ type: "success", message: "Commit logged in the Change log tab." });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unexpected error.";
      setGithubNotice({ type: "error", message: reason });
    } finally {
      setIsSaving(false);
      window.setTimeout(() => setGithubNotice(null), 10000);
    }
  }, [
    appendChangeLogEntry,
    articles,
    datasetChangelog.articles,
    datasetChangelog.markdown,
    hasInvalidJsonDraft,
    onTabChange,
    pushChangeLogNotice,
    setPasswordKey,
    verifyDevCredentials,
  ]);

  const handleDeleteArticle = useCallback(async () => {
    if (isDeletingArticle) {
      return;
    }

    if (!selectedArticle) {
      setArticleDeleteNotice({ type: "error", message: "Select an article before deleting." });
      return;
    }

    if (!articleDeleteConfirmed) {
      setArticleDeleteNotice({ type: "error", message: "Confirm the deletion before proceeding." });
      return;
    }

    const nextArticles = articles.filter((_, index) => index !== selectedIndex);
    if (nextArticles.length === articles.length) {
      setArticleDeleteNotice({ type: "error", message: "Unable to identify the article to delete." });
      return;
    }

    const deletedLabel = selectedArticleSummary?.title ?? articleLabel ?? `Article ${selectedIndex + 1}`;

    setIsDeletingArticle(true);
    setArticleDeleteNotice({ type: "success", message: "Verifying credentials…" });

    try {
      const credentials = await verifyDevCredentials();

      setArticleDeleteNotice({ type: "success", message: "Submitting deletion to GitHub…" });

      const commitMessage = `Remove ${deletedLabel} - ${new Date().toLocaleString()}`;

      const deletionChangelog = buildDatasetChangelog({
        articles: nextArticles,
        getOriginalArticle,
        formatHeading: (article, index) =>
          formatArticleLabel(article ?? nextArticles[index] ?? articles[index], index),
        summarizeArticle: (article, index) =>
          extractChangeLogSummary(article, index) ??
          extractChangeLogSummary(nextArticles[index], index) ??
          extractChangeLogSummary(articles[index], index) ??
          extractChangeLogSummary(getOriginalArticle(index), index),
      });

      const saveResponse = await fetch("/api/save-articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
          articlesData: nextArticles,
          commitMessage,
          changelogMarkdown: deletionChangelog.markdown,
          changedArticles: deletionChangelog.articles,
        }),
      });

      const result = await saveResponse.json().catch(() => ({}));

      if (!saveResponse.ok) {
        throw new Error(result.details || result.error || "Delete failed.");
      }

      const resolvedKey =
        typeof result.submittedBy === "string" && result.submittedBy.trim().length > 0
          ? result.submittedBy.trim()
          : credentials.key;
      setPasswordKey(resolvedKey);

      replaceArticles(nextArticles);
      const nextLength = nextArticles.length;
      const nextSelectedIndex = nextLength === 0 ? 0 : Math.min(selectedIndex, nextLength - 1);
      setSelectedIndex(nextSelectedIndex);

      setArticleDeleteNotice({
        type: "success",
        message: `Deleted ${deletedLabel}. Commit saved to GitHub.`,
      });

      if (result.entry && typeof result.entry === "object") {
        const entry = result.entry as ChangeLogEntry;
        const sanitizedEntry: ChangeLogEntry = {
          ...entry,
          commit: {
            sha: entry.commit?.sha ?? "",
            url: entry.commit?.url ?? "",
            message: entry.commit?.message ?? commitMessage,
          },
          submittedBy: entry.submittedBy ?? resolvedKey,
        };
        setChangeLogEntries((previous) => appendChangeLogEntry(previous, sanitizedEntry));
        onTabChange("change-log");
        pushChangeLogNotice({ type: "success", message: "Commit logged in the Change log tab." });
      } else {
        pushChangeLogNotice({ type: "success", message: `Deleted ${deletedLabel}.` });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Deletion failed.";
      setArticleDeleteNotice({ type: "error", message: reason });
    } finally {
      setIsDeletingArticle(false);
      setArticleDeleteConfirmed(false);
    }
  }, [
    appendChangeLogEntry,
    articleDeleteConfirmed,
    articleLabel,
    articles,
    getOriginalArticle,
    isDeletingArticle,
    onTabChange,
    pushChangeLogNotice,
    replaceArticles,
    selectedArticle,
    selectedArticleSummary,
    selectedIndex,
    setChangeLogEntries,
    setPasswordKey,
    setSelectedIndex,
    verifyDevCredentials,
  ]);

  const clearNoticesForTab = useCallback(
    (tab: DevModeTab) => {
      if (tab === "edit" || tab === "tag-editor") {
        setCreatorNotice(null);
      }
      if (tab === "create" || tab === "tag-editor") {
        setNotice(null);
      }
      setGithubNotice(null);
      if (tab !== "change-log") {
        setChangeLogNotice(null);
      }
    },
    [setChangeLogNotice, setCreatorNotice, setGithubNotice, setNotice],
  );

  const handleTabChange = useCallback(
    (tab: DevModeTab) => {
      clearNoticesForTab(tab);
      if (tab === activeTab) {
        return;
      }
      onTabChange(tab);
    },
    [activeTab, clearNoticesForTab, onTabChange],
  );

  useEffect(() => {
    if (activeTab === "profile" && !hasStoredCredentials) {
      handleTabChange("edit");
    }
  }, [activeTab, handleTabChange, hasStoredCredentials]);

  useEffect(() => {
    if (activeTab === "profile") {
      if (!profileVerifyAttemptRef.current) {
        profileVerifyAttemptRef.current = true;
        if (hasStoredCredentials && !passwordKey) {
          verifyDevCredentials().catch(() => {
            // handled through notice system
          });
        }
      }
    } else {
      profileVerifyAttemptRef.current = false;
    }
  }, [activeTab, hasStoredCredentials, passwordKey, verifyDevCredentials]);

  useEffect(() => {
    clearNoticesForTab(activeTab);
  }, [activeTab, clearNoticesForTab]);

  const resetNewArticleForm = useCallback(() => {
    resetNewArticleFormState();
    setCreatorNotice({ type: "success", message: "New article form reset." });
    setIsNewArticleStaged(false);
    setStagedArticleLabel(null);
    setStagedArticleId(null);
  }, [
    resetNewArticleFormState,
    setCreatorNotice,
    setIsNewArticleStaged,
    setStagedArticleLabel,
    setStagedArticleId,
  ]);

  const copyNewArticleJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(newArticleJson);
      setCreatorNotice({ type: "success", message: "New article JSON copied to clipboard." });
    } catch {
      setCreatorNotice({ type: "error", message: "Clipboard copy failed. Try downloading instead." });
    }
  }, [newArticleJson]);

  const downloadNewArticleJson = useCallback(() => {
    const baseLabel = newArticleForm.title.trim() || newArticleForm.drugName.trim() || "new-substance";
    const slug = toFileSlug(baseLabel || "new-substance");
    const fileName = `new-article-${slug || "record"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const blob = new Blob([newArticleJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setCreatorNotice({ type: "success", message: "New article JSON downloaded." });
  }, [newArticleForm.drugName, newArticleForm.title, newArticleJson]);

  const handleStageNewArticle = useCallback(() => {
    if (!isNewArticleValid) {
      setCreatorNotice({
        type: "error",
        message: "Complete the required fields (title, drug name, route + units) before staging.",
      });
      return;
    }

    const parsedExistingId = Number.parseInt(newArticleForm.id.trim(), 10);
    const hasExistingId = Number.isFinite(parsedExistingId);
    const conflictingIndex = hasExistingId
      ? articles.findIndex((record) => {
          if (!record) {
            return false;
          }
          if (typeof record.id === "number") {
            return record.id === parsedExistingId;
          }
          if (typeof record.id === "string") {
            const parsed = Number.parseInt(record.id, 10);
            return Number.isFinite(parsed) && parsed === parsedExistingId;
          }
          return false;
        })
      : -1;
    const isReusingStagedId = hasExistingId && stagedArticleId === parsedExistingId;
    const assignedId =
      !hasExistingId || (conflictingIndex !== -1 && !isReusingStagedId)
        ? nextAvailableArticleId
        : parsedExistingId;

    const normalizedForm: ArticleDraftForm = {
      ...newArticleForm,
      id: assignedId.toString(),
    };
    replaceNewArticleForm(normalizedForm, { emitMutate: false });

    const draftPayload = buildArticleFromDraft(normalizedForm);

    applyArticlesTransform((previous) => {
      const stagedArticle = draftPayload as (typeof previous)[number];
      const next = [...previous];
      const targetIndex = next.findIndex((record) => {
        if (!record) {
          return false;
        }
        if (typeof record.id === "number") {
          return record.id === assignedId;
        }
        if (typeof record.id === "string") {
          const parsed = Number.parseInt(record.id, 10);
          return Number.isFinite(parsed) && parsed === assignedId;
        }
        return false;
      });

      if (targetIndex >= 0) {
        next[targetIndex] = stagedArticle;
        return next;
      }

      next.push(stagedArticle);
      return next;
    });

    const stagedLabel = normalizedForm.title.trim() || normalizedForm.drugName.trim() || `Article ${assignedId}`;
    const noticeParts: string[] = [];

    if (!hasExistingId) {
      noticeParts.push(`ID auto-assigned to #${assignedId}.`);
    } else if (parsedExistingId !== assignedId) {
      noticeParts.push(`ID reset from ${parsedExistingId} to #${assignedId} to avoid conflicts.`);
    }

    setIsNewArticleStaged(true);
    setStagedArticleLabel(stagedLabel);
    setStagedArticleId(assignedId);
    setCreatorNotice({
      type: "success",
      message: `Staged "${stagedLabel}" for commit.${noticeParts.length > 0 ? ` ${noticeParts.join(" ")}` : ""}`,
    });
  }, [
    applyArticlesTransform,
    articles,
    buildArticleFromDraft,
    isNewArticleValid,
    newArticleForm,
    nextAvailableArticleId,
    replaceNewArticleForm,
    setCreatorNotice,
    setIsNewArticleStaged,
    setStagedArticleId,
    setStagedArticleLabel,
    stagedArticleId,
  ]);

  const handleClassificationChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!value) {
      return;
    }

    const nextValue = classificationOptions.find((option) => option.value === value)?.value;
    if (!nextValue) {
      return;
    }

    setClassificationView(nextValue);
  };

  const handleCategoryJump = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!value) {
      return;
    }

    const nextIndex = Number(value);
    if (Number.isNaN(nextIndex)) {
      event.target.value = "";
      return;
    }

    setArticleDeleteNotice(null);
    setSelectedIndex(nextIndex);
    event.target.value = "";
  };

  const handleProfileUpdated = useCallback(
    (nextProfile: NormalizedUserProfile, canonicalKey: string) => {
      setProfileData(nextProfile);
      updateProfileCache(nextProfile);
      setPasswordKey(canonicalKey);
    },
    [setPasswordKey, updateProfileCache],
  );

  const copyDatasetMarkdownForTagEditor = useCallback(async () => {
    await navigator.clipboard.writeText(datasetChangelog.markdown);
  }, [datasetChangelog.markdown]);

  const downloadDatasetMarkdownForTagEditor = useCallback(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `dataset-changelog-${timestamp}.diff`;
    const blob = new Blob([datasetChangelog.markdown], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [datasetChangelog.markdown]);

  const commitPanel = (
    <DevCommitCard
      notice={githubNotice}
      trimmedAdminPassword={trimmedAdminPassword}
      passwordKey={passwordKey}
      hasInvalidJsonDraft={hasInvalidJsonDraft}
      isSaving={isSaving}
      isCommitDisabled={isCommitDisabled}
      onCommit={handleSaveToGitHub}
    />
  );

  const createCommitPanel = (
    <DevCommitCard
      notice={githubNotice}
      trimmedAdminPassword={trimmedAdminPassword}
      passwordKey={passwordKey}
      hasInvalidJsonDraft={hasInvalidJsonDraft}
      isSaving={isSaving}
      isCommitDisabled={isCreateCommitDisabled}
      onCommit={handleSaveToGitHub}
      footerSlot={
        isNewArticleStaged ? (
          <span>
            {`Staged ${
              stagedArticleLabel ? `"${stagedArticleLabel}"` : "article"
            }${stagedArticleId ? ` (ID #${stagedArticleId})` : ""}. Dataset diff updated and ready to commit.`}
          </span>
        ) : (
          <span>Stage the draft to add it to the dataset and unlock commits from this tab.</span>
        )
      }
    />
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 text-white md:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="mt-4 flex items-center justify-center gap-3 text-3xl font-bold tracking-tight text-fuchsia-300 sm:text-4xl">
          <Wrench className="h-8 w-8 text-current" aria-hidden="true" focusable="false" />
          <span>Dev Tools</span>
        </h1>
      </div>

      <div className="mt-10 flex justify-center">
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20">
          <form className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4" onSubmit={handleCredentialsSave}>
            <div className="flex-1 space-y-3">
              <div>
                <label
                  className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45"
                  htmlFor="dev-mode-saved-username"
                >
                  Username (ENV key)
                </label>
                <input
                  id="dev-mode-saved-username"
                  type="text"
                  className={baseInputClass}
                  placeholder="Enter your username"
                  autoComplete="username"
                  value={usernameDraft}
                  onChange={(event) => setUsernameDraft(event.target.value)}
                  onKeyDown={handleCredentialInputKeyDown}
                />
              </div>
              <div>
                <label
                  className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45"
                  htmlFor="dev-mode-saved-password"
                >
                  User password
                </label>
                <div className="relative">
                  <input
                    id="dev-mode-saved-password"
                    type={isPasswordVisible ? "text" : "password"}
                    className={`${baseInputClass} pr-12`}
                    placeholder="Paste your user password"
                    autoComplete="current-password"
                    value={passwordDraft}
                    onChange={(event) => setPasswordDraft(event.target.value)}
                    onKeyDown={handleCredentialInputKeyDown}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-3 flex items-center text-white/55 transition hover:text-white"
                    onClick={() => setIsPasswordVisible((prev) => !prev)}
                    aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  >
                    {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/10 disabled:text-white/50"
              disabled={isVerifyingCredentials}
            >
              {isVerifyingCredentials ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isVerifyingCredentials ? "Verifying…" : "Save"}
            </button>
          </form>
          <div className="mt-2 min-h-[1.25rem] text-xs">
            {passwordNotice ? (
              <p className={passwordNotice.type === "error" ? "text-rose-300" : "text-emerald-300"}>
                {passwordNotice.message}
              </p>
            ) : (
              <p className="text-white/45">
                Save to verify your ENV credentials. Leave both fields blank and press Save to log out.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 text-xs text-white/65 md:flex-row md:items-center md:justify-between">
            {passwordKey ? (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-200">
                <BadgeCheck className="h-4 w-4" />
                <span>Logged in as {passwordKey}</span>
                <span className="text-emerald-200/75">• Verified {verifiedBadgeText ?? "just now"}</span>
              </div>
            ) : hasStoredCredentials ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-medium text-white/70">
                <RefreshCw className="h-4 w-4" />
                <span>Credentials stored. Save to verify.</span>
              </div>
            ) : (
              <div className="text-white/45">Not logged in.</div>
            )}
            {hasStoredCredentials && (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 px-3 py-1 font-medium text-white/75 transition hover:border-white/30 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isVerifyingCredentials}
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => handleTabChange("edit")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === "edit" ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:text-white"
            }`}
            aria-pressed={activeTab === "edit"}
          >
            Edit Substances
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("create")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === "create" ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:text-white"
            }`}
            aria-pressed={activeTab === "create"}
          >
            Create Substances
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("change-log")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === "change-log" ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:text-white"
            }`}
            aria-pressed={activeTab === "change-log"}
          >
            Change Log
          </button>
          {hasStoredCredentials && (
            <button
              type="button"
              onClick={() => handleTabChange("profile")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === "profile" ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:text-white"
              }`}
              aria-pressed={activeTab === "profile"}
            >
              Profile
            </button>
          )}
          <button
            type="button"
            onClick={() => handleTabChange("tag-editor")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === "tag-editor" ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:text-white"
            }`}
            aria-pressed={activeTab === "tag-editor"}
          >
            Tag Editor
          </button>
        </div>
      </div>
      {activeTab === "edit" ? (
        <div className="mt-10 grid gap-6 md:grid-cols-[19rem,1fr]">
          <div className="space-y-6">
            <SectionCard className="space-y-6 bg-white/[0.04]">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-fuchsia-200">Select an article</h2>
              <p className="text-sm text-white/65">
                Choose any record sourced from
                <code className="ml-1 inline-flex rounded bg-white/10 px-2 py-[2px] text-xs font-semibold text-white/80">
                  articles.json
                </code>
                to begin editing.
              </p>
            </div>
            <label className="sr-only" htmlFor="dev-mode-article">
              Article
            </label>
            <div className="relative">
              <select
                id="dev-mode-article"
                className={baseSelectClass}
                value={hasArticles ? selectedIndex : ""}
                onChange={(event) => {
                  const { value } = event.target;
                  if (value === "") {
                    return;
                  }
                  const nextIndex = Number(value);
                  if (Number.isNaN(nextIndex)) {
                    return;
                  }
                  setArticleDeleteNotice(null);
                  setSelectedIndex(nextIndex);
                }}
                disabled={!hasArticles}
              >
                {hasArticles ? (
                  articleOptions.map(({ index, label }) => (
                    <option key={index} value={index}>
                      {label}
                    </option>
                  ))
                ) : (
                  <option value="">No articles available</option>
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            </div>

            {categoryDropdowns.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
                <div className="mb-3 space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-white/60">Jump by</p>
                  <div className="relative w-full max-w-full min-w-0 sm:max-w-[14rem]">
                    <label className="sr-only" htmlFor="dev-mode-classification">
                      Classification type
                    </label>
                    <select
                      id="dev-mode-classification"
                      className={`${compactSelectClass} text-sm min-w-0 max-w-full`}
                      value={classificationView}
                      onChange={handleClassificationChange}
                    >
                      {classificationOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  </div>
                </div>
                <div className="space-y-3">
                  {categoryDropdowns.map((group) => (
                    <div key={group.key} className="flex flex-col gap-1 text-left">
                      <label
                        htmlFor={`dev-mode-category-${group.key}`}
                        className="text-[11px] font-semibold uppercase tracking-wide text-white/45"
                      >
                        {group.name}
                      </label>
                      <div className="relative">
                        <select
                          id={`dev-mode-category-${group.key}`}
                          className={compactSelectClass}
                          defaultValue=""
                          onChange={handleCategoryJump}
                        >
                          <option value="">Select substance…</option>
                          {group.options.map((option) => (
                            <option key={`${group.key}-${option.index}`} value={option.index.toString()}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard className="space-y-4 bg-white/[0.04]">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-fuchsia-200">Working tips</h2>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-sm text-white/70">
              <li>Default to UI view for structured editing; flip to JSON when you need raw control.</li>
              <li>Draft updates stay local until you push via the GitHub panel or download a backup copy.</li>
              <li>Save your username and password above, then use the GitHub card to commit edits directly to the repository.</li>
              <li>Review the Current draft diff card before committing; reset controls restore the source data instantly.</li>
            </ul>
          </SectionCard>

          <SectionCard className="space-y-4 bg-white/[0.04]">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-fuchsia-200">Manage drafts</h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/80 transition hover:border-white/25 hover:text-white"
                onClick={resetArticle}
              >
                <Undo2 className="h-4 w-4" />
                Reset article
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/80 transition hover:border-white/25 hover:text-white"
                onClick={resetDataset}
              >
                <RefreshCw className="h-4 w-4" />
                Reset all
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-1.5 text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white"
                onClick={downloadDraft}
              >
                <Download className="h-4 w-4" />
                Download dataset
              </button>
            </div>
            <div className="h-px w-full bg-white/10" />
            <div className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-rose-200">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" focusable="false" />
                Danger zone
              </div>
              <p className="text-sm text-rose-100/80">
                {selectedArticle
                  ? `Deleting "${articleDeleteTargetLabel}" removes it immediately and pushes the change to GitHub. Use the dataset reset tools if you need to restore it.`
                  : "Select an article to enable deletion. The removal is committed to GitHub right away."}
              </p>
              {articleDeleteNotice && (
                <p
                  className={`text-xs ${
                    articleDeleteNotice.type === "error" ? "text-rose-200" : "text-emerald-200"
                  }`}
                >
                  {articleDeleteNotice.message}
                </p>
              )}
              <label className="flex items-center gap-2 text-xs text-rose-100/75">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-rose-300/50 bg-slate-950/60 text-rose-400 focus:ring-rose-300/40"
                  checked={articleDeleteConfirmed}
                  onChange={(event) => setArticleDeleteConfirmed(event.target.checked)}
                  disabled={!selectedArticle || isDeletingArticle}
                />
                I understand this will permanently remove the article.
              </label>
              <button
                type="button"
                className={dangerButtonClass}
                onClick={handleDeleteArticle}
                disabled={!articleDeleteConfirmed || !selectedArticle || isDeletingArticle}
              >
                {isDeletingArticle ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" focusable="false" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" focusable="false" />
                )}
                {isDeletingArticle ? "Deleting…" : "Delete article"}
              </button>
            </div>
          </SectionCard>

          </div>

          <div className="space-y-6">
          <SectionCard className="space-y-5 bg-white/[0.04]">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-fuchsia-200">Article workspace</h2>
              <p className="text-sm text-white/65">Switch between structured form controls and raw JSON as you refine a record.</p>
            </div>
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-xs">
              <button
                type="button"
                onClick={switchToUiMode}
                aria-pressed={draftMode === "ui"}
                className={`rounded-full px-3 py-1.5 font-semibold transition ${draftMode === "ui" ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:text-white"}`}
              >
                UI view
              </button>
              <button
                type="button"
                onClick={switchToJsonMode}
                aria-pressed={draftMode === "json"}
                className={`rounded-full px-3 py-1.5 font-semibold transition ${draftMode === "json" ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:text-white"}`}
              >
                JSON view
              </button>
            </div>
            {draftMode === "ui" ? (
              <div className="space-y-8">
                <ArticleDraftFormFields idPrefix="edit-article" controller={editArticleController} />
              </div>
            ) : (
              <JsonEditor
                id="dev-mode-editor"
                className="flex-1"
                minHeight={360}
                value={editorValue}
                onChange={handleEditorChange}
              />
            )}
            <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
              <div className="min-h-[1.25rem]">
                {notice && (
                  <p className={notice.type === "error" ? "text-rose-300" : "text-emerald-300"}>{notice.message}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-1.5 text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={downloadArticle}
                  disabled={hasInvalidJsonDraft}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download article
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white"
                  onClick={copyDraft}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy JSON
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={applyEdits}
                  disabled={hasInvalidJsonDraft}
                >
                  Save draft
                </button>
              </div>
            </div>
          </SectionCard>

          {commitPanel}

          <SectionCard className="space-y-6 bg-white/[0.04]">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-fuchsia-200">Current draft diff</h2>
              <p className="text-sm text-white/65">
                {selectedArticleSummary
                  ? `Tracking unsaved edits for ${selectedArticleSummary.title}.`
                  : "Preview differences against the source dataset."}
              </p>
            </div>
            <DiffPreview diffText={changelogMarkdown} className="max-h-64" />
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white"
                onClick={copyChangelog}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy diff
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white"
                onClick={downloadChangelog}
              >
                <Download className="h-3.5 w-3.5" />
                Download .diff
              </button>
            </div>
            {changeLogNotice && (
              <div
                className={`rounded-xl border px-3 py-2 text-xs ${
                  changeLogNotice.type === "error"
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                    : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                }`}
              >
                {changeLogNotice.message}
              </div>
            )}
            <div className="h-px w-full bg-white/10" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-fuchsia-200">Previous commits</h2>
              <p className="text-sm text-white/65">
                {selectedArticleSummary
                  ? selectedArticleHistoryTotal > 0
                    ? `Showing the latest ${selectedArticleHistory.length} of ${selectedArticleHistoryTotal} logged updates for ${selectedArticleSummary.title}.`
                    : `No commits have been logged for ${selectedArticleSummary.title} yet.`
                  : "No article selected."}
              </p>
            </div>
            {selectedArticleHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950 px-6 py-12 text-center">
                <Wrench className="mb-4 h-10 w-10 text-white/35" />
                <p className="text-sm font-semibold text-white/80">No history captured yet</p>
                <p className="mt-2 text-xs text-white/55">Commit changes to populate the timeline.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedArticleHistory.map((entry) => (
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
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/80 transition hover:border-white/25 hover:text-white"
                          onClick={() => handleCopyChangeLogEntry(entry)}
                        >
                          <Copy className="h-4 w-4" />
                          Copy diff
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/80 transition hover:border-white/25 hover:text-white"
                          onClick={() => handleDownloadChangeLogEntry(entry)}
                        >
                          <Download className="h-4 w-4" />
                          Download .diff
                        </button>
                      </div>
                    </div>
                    <DiffPreview diffText={entry.markdown} className="max-h-56" />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          </div>
        </div>
      ) : activeTab === "create" ? (
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[2fr,1fr]">
          <SectionCard className="space-y-8 bg-white/[0.04]">
            <ArticleDraftFormFields idPrefix="new-article" controller={newArticleController} />
          </SectionCard>

          <div className="space-y-6">
            <SectionCard className="flex flex-col space-y-4 bg-white/[0.04]">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-fuchsia-200">Generated JSON</h2>
                <p className="text-sm text-white/65">Structure updates as you complete the form.</p>
                {!isNewArticleValid && (
                  <p className="text-xs text-amber-300">
                    Required: title, drug name, and one administration route with units.
                  </p>
                )}
                {creatorNotice && (
                  <p className={`text-xs ${creatorNotice.type === "error" ? "text-rose-300" : "text-emerald-300"}`}>
                    {creatorNotice.message}
                  </p>
                )}
              </div>
              <JsonEditor value={newArticleJson} minHeight={previewMinHeight} readOnly />
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleStageNewArticle}
                  className="flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!isNewArticleValid}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {isNewArticleStaged ? "Restage article" : "Stage article"}
                </button>
                <button
                  type="button"
                  onClick={copyNewArticleJson}
                  className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={downloadNewArticleJson}
                  className="flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-1.5 text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download JSON
                </button>
                <button
                  type="button"
                  onClick={resetNewArticleForm}
                  className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Reset form
                </button>
              </div>
            </SectionCard>
            {createCommitPanel}
          </div>
        </div>
      ) : activeTab === "change-log" ? (
        <div className="mt-10 grid gap-6 md:grid-cols-[19rem,1fr]">
          <div className="space-y-6">
            <SectionCard className="space-y-5 bg-white/[0.04] md:sticky md:top-24">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-fuchsia-200">Refine history</h2>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="change-log-article">
                  Article
                </label>
                <div className="relative">
                  <select
                    id="change-log-article"
                    className={baseSelectClass}
                    value={changeLogFilters.articleSlug ?? ""}
                    onChange={handleChangeLogArticleSelect}
                  >
                    <option value="">All articles</option>
                    {changeLogArticleOptions.map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="change-log-start">
                    Start date
                  </label>
                  <input
                    id="change-log-start"
                    type="date"
                    value={changeLogFilters.startDate ?? ""}
                    onChange={handleChangeLogDateChange("startDate")}
                    className={baseInputClass}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="change-log-end">
                    End date
                  </label>
                  <input
                    id="change-log-end"
                    type="date"
                    value={changeLogFilters.endDate ?? ""}
                    onChange={handleChangeLogDateChange("endDate")}
                    className={baseInputClass}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="rounded-full border border-white/12 px-3 py-1.5 text-white/80 transition hover:border-white/25 hover:text-white"
                  onClick={() => applyQuickDateRange(7)}
                >
                  Past 7 days
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/12 px-3 py-1.5 text-white/80 transition hover:border-white/25 hover:text-white"
                  onClick={() => applyQuickDateRange(30)}
                >
                  Past 30 days
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/12 px-3 py-1.5 text-white/80 transition hover:border-white/25 hover:text-white"
                  onClick={() => applyQuickDateRange(null)}
                >
                  All time
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="change-log-search">
                  Search
                </label>
                <input
                  id="change-log-search"
                  type="search"
                  placeholder="Find commits by keyword or diff copy…"
                  value={changeLogFilters.searchQuery}
                  onChange={handleChangeLogSearchChange}
                  className={baseInputClass}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                <span className="rounded-full bg-white/10 px-3 py-1">{`${changeLogEntries.length} entr${changeLogEntries.length === 1 ? "y" : "ies"}`}</span>
                {latestChangeLogEntry && (
                  <span className="rounded-full bg-white/10 px-3 py-1">
                    Latest: {new Date(latestChangeLogEntry.createdAt).toLocaleString(undefined, {
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

              {activeChangeLogFilterCount > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                  <span>{activeChangeLogFilterCount} filters active</span>
                  <button
                    type="button"
                    className="text-white/80 transition hover:text-white"
                    onClick={clearChangeLogFilters}
                  >
                    Clear
                  </button>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-6">
            {changeLogNotice && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  changeLogNotice.type === "error"
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                    : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                }`}
              >
                {changeLogNotice.message}
              </div>
            )}

            <SectionCard className="space-y-4 bg-white/[0.04]">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-fuchsia-200">GitHub commits</h2>
              </div>

              {filteredChangeLogEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950 px-6 py-16 text-center">
                  <Wrench className="mb-4 h-10 w-10 text-white/40" />
                  <p className="text-base font-semibold text-white/80">No commits logged yet</p>
                  <p className="mt-2 text-sm text-white/60">Ship your first draft to populate the timeline.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredChangeLogEntries.map((entry) => (
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
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/80 transition hover:border-white/25 hover:text-white"
                            onClick={() => handleCopyChangeLogEntry(entry)}
                          >
                            <Copy className="h-4 w-4" />
                            Copy diff
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/80 transition hover:border-white/25 hover:text-white"
                            onClick={() => handleDownloadChangeLogEntry(entry)}
                          >
                            <Download className="h-4 w-4" />
                            Download .diff
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {entry.articles.map((article) => (
                          <button
                            key={`${entry.id}-${article.slug}`}
                            type="button"
                            className="rounded-full border border-white/12 px-3 py-1 text-xs text-white/80 transition hover:border-white/25 hover:text-white"
                            onClick={() => focusArticleFilter(article.slug)}
                          >
                            {article.title}
                          </button>
                        ))}
                      </div>

                      <DiffPreview diffText={entry.markdown} className="max-h-56" />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      ) : activeTab === "profile" ? (
        <ProfileEditorTab
          baseInputClass={baseInputClass}
          profile={profileData}
          profileHistory={profileHistory}
          verifyCredentials={verifyDevCredentials}
          onProfileUpdated={handleProfileUpdated}
          hasStoredCredentials={hasStoredCredentials}
        />
      ) : activeTab === "tag-editor" ? (
        <TagEditorTab
          commitPanel={commitPanel}
          datasetMarkdown={datasetChangelog.markdown}
          hasDatasetChanges={hasDatasetChanges}
          onCopyDatasetMarkdown={copyDatasetMarkdownForTagEditor}
          onDownloadDatasetMarkdown={downloadDatasetMarkdownForTagEditor}
        />
      ) : null}
    </main>
  );
}
