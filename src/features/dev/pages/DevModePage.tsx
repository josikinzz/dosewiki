import { Icon } from "@/components/common/Icon";
import { useLibrary } from "@/data/SubstanceIndexProvider";
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
  type ChangeLogEntry,
  type ChangeLogArticleSummary,
} from "@/data/changelog/changeLog";
import { buildArticleChangelog, buildDatasetChangelog, buildTextChangelog } from "@/utils/data/changelog";
import { DiffPreview } from "@/components/common/DiffPreview";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import { useSaveArticlesMutation, useAuthMutation, useSaveArticlesToConvex, useSaveChangelogToConvex } from "@/hooks/useApiMutations";
import { isConvexEnabled } from "@/lib/convex";
import { useQuery as useConvexQuery, useMutation as useConvexMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { SubstanceArticle } from "@/schema";
import { createEmptyArticle } from "@/data/schema";
import { IndexLayoutTab } from "../tools/index-layout/IndexLayoutTab";
import { AboutEditorTab } from "../tools/about/AboutEditorTab";
import { slugify } from "@/utils/slug";
import { viewToPath } from "@/utils/routing";
import { useDevMode } from "../context/DevModeContext";
import { DevCommitCard } from "../components/DevCommitCard";
import { TagEditorTab } from "../tags";
import { ProfileEditorTab } from "../profile";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import { SubstanceEditorTab } from "../tools/substance-editor/SubstanceEditorTab";

// Helper to stringify articles as YAML for human-readable display
const toYaml = (value: unknown): string => {
  try {
    return yamlStringify(value, { lineWidth: 0 });
  } catch {
    return "# Failed to serialize as YAML";
  }
};

// Helper to parse YAML input
const fromYaml = (value: string): unknown => {
  return yamlParse(value);
};
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
import { getProfileByKey, updateProfileCache, userProfiles } from "@/data/userProfiles";
import type { NormalizedUserProfile } from "@/data/userProfiles";

type ChangeNotice = {
  type: "success" | "error";
  message: string;
};

type ArticleRecord = SubstanceArticle;

type ChangeLogFilters = {
  articleSlug: string | null;
  startDate: string | null;
  endDate: string | null;
  searchQuery: string;
};

type DevModeTab =
  | "change-log"
  | "tag-editor"
  | "profile"
  | "index-layout"
  | "about"
  | "articles";

type DevModePrimaryTab = "tools" | "change-log" | "profile";

const devModePrimaryDefaults: Record<DevModePrimaryTab, DevModeTab> = {
  tools: "articles",
  "change-log": "change-log",
  profile: "profile",
};

const resolvePrimaryTab = (tab: DevModeTab): DevModePrimaryTab => {
  if (tab === "tag-editor" || tab === "index-layout" || tab === "about" || tab === "articles") {
    return "tools";
  }
  if (tab === "change-log") {
    return "change-log";
  }
  return "profile";
};

type DevModePageProps = {
  activeTab: DevModeTab;
  initialArticleSlug?: string;
  onTabChange: (tab: DevModeTab) => void;
};

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

// Merge draft SubstanceArticle with original, preserving id from original if not set
const mergeArticleWithOriginal = (original: unknown, draft: ArticleRecord): ArticleRecord => {
  if (!original || typeof original !== "object") {
    return draft;
  }

  const originalArticle = original as ArticleRecord;
  return {
    ...draft,
    id: draft.id ?? originalArticle.id,
  };
};

const extractChangeLogSummary = (record: unknown, index: number): ChangeLogArticleSummary | null => {
  if (!record || typeof record !== "object") {
    return null;
  }

  const entry = record as {
    id?: unknown;
    title?: unknown;
    identification?: {
      common_name?: unknown;
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
  const commonName = typeof entry.identification?.common_name === "string" ? entry.identification.common_name.trim() : "";

  const title = rawTitle || commonName || `Article ${index + 1}`;
  const slugSource = commonName || title || `article-${idValue}`;
  const slug = slugify(slugSource) || `article-${idValue}`;

  return {
    id: idValue,
    title,
    slug,
  };
};

export function DevModePage({ activeTab, initialArticleSlug: _initialArticleSlug, onTabChange }: DevModePageProps) {
  const {
    articles,
    psychoactiveIndexManual,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    close,
    updateArticleAt,
    resetArticleAt,
    resetAll,
    getOriginalArticle,
    getOriginalArticles,
    getOriginalPsychoactiveIndexManual,
    getOriginalAboutMarkdown,
    getOriginalAboutSubtitle,
    getOriginalAboutFounderKeys,
    replaceArticles,
    applyArticlesTransform,
    replaceAboutMarkdown,
    resetAboutMarkdown,
    replaceAboutSubtitle,
    resetAboutSubtitle,
    replaceAboutFounderKeys,
    resetAboutFounderKeys,
    generatorPrompt,
    replaceGeneratorPrompt,
    resetGeneratorPrompt,
    getOriginalGeneratorPrompt,
  } = useDevMode();

  console.log("[DevModePage] useDevMode() returned articles:", articles.length);

  const {
    chemicalClassIndexGroups,
    dosageCategoryGroups,
    effectSummaries,
    mechanismIndexGroups,
    substanceRecords,
  } = useLibrary();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const _initialSlugAppliedRef = useRef<string | null>(null);
  const [classificationView, setClassificationView] = useState<ClassificationView>("psychoactive");
  const [editorValue, setEditorValue] = useState("{}");
  const [_notice, setNotice] = useState<ChangeNotice | null>(null);
  const [articleDeleteConfirmed, setArticleDeleteConfirmed] = useState(false);
  const [_articleDeleteNotice, setArticleDeleteNotice] = useState<ChangeNotice | null>(null);
  const [isDeletingArticle, setIsDeletingArticle] = useState(false);
  const [draftMode, setDraftMode] = useState<"ui" | "json">("ui");
  const [createDraftMode, setCreateDraftMode] = useState<"ui" | "json">("ui");
  const [_creatorNotice, setCreatorNotice] = useState<ChangeNotice | null>(null);
  const [isNewArticleStaged, setIsNewArticleStaged] = useState(false);
  const [stagedArticleLabel, setStagedArticleLabel] = useState<string | null>(null);
  const [stagedArticleId, setStagedArticleId] = useState<number | null>(null);
  const handleCreatorMutate = useCallback(() => {
    setCreatorNotice(null);
    setIsNewArticleStaged(false);
    setStagedArticleLabel(null);
    setStagedArticleId(null);
  }, [setCreatorNotice, setIsNewArticleStaged, setStagedArticleLabel, setStagedArticleId]);
  // RHF form ref for new article creation
  const newArticleFormRef = useRef<UseArticleFormReturn | null>(null);
  // Track form values reactively for UI updates
  const [newArticleValues, setNewArticleValues] = useState<SubstanceArticle>(() => createEmptyArticle());
  // Update tracked values when form changes
  const _handleNewArticleMutate = useCallback(() => {
    handleCreatorMutate();
    const values = newArticleFormRef.current?.methods.getValues();
    if (values) {
      setNewArticleValues(values);
    }
  }, [handleCreatorMutate]);
  const resetNewArticleFormState = useCallback(() => {
    newArticleFormRef.current?.resetForm();
    setNewArticleValues(createEmptyArticle());
  }, []);
  const [username, setUsername] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<ChangeNotice | null>(null);
  const [passwordKey, setPasswordKey] = useState<string | null>(null);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isVerifyingCredentials, setIsVerifyingCredentials] = useState(false);
  const [githubNotice, setGithubNotice] = useState<ChangeNotice | null>(null);
  const saveArticlesMutation = useSaveArticlesMutation();
  const authMutation = useAuthMutation();
  const convexSave = useSaveArticlesToConvex();
  const convexChangelogSave = useSaveChangelogToConvex();
  const convexSaveAbout = useConvexMutation(api.siteConfig.saveAbout);
  const isSaving = saveArticlesMutation.isPending;
  const [isConvexSaving, setIsConvexSaving] = useState(false);
  const [convexNotice, setConvexNotice] = useState<ChangeNotice | null>(null);
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

  // Fetch changelog entries from Convex when enabled
  const convexEnabled = isConvexEnabled();
  const convexChangelogEntries = useConvexQuery(
    api.changelog.getAll,
    convexEnabled ? {} : "skip"
  );

  // Merge Convex changelog entries with static entries
  useEffect(() => {
    if (!convexEnabled || !convexChangelogEntries) {
      return;
    }

    // Convert Convex entries to ChangeLogEntry format
    const convexEntries: ChangeLogEntry[] = convexChangelogEntries.map((entry) => ({
      id: entry.entryId,
      createdAt: entry.createdAt,
      commit: {
        sha: "",
        url: "",
        message: entry.message,
      },
      articles: entry.articles,
      markdown: entry.markdown,
      submittedBy: entry.submittedBy,
    }));

    // Merge with static entries, avoiding duplicates by ID
    const staticIds = new Set(initialChangeLogEntries.map((e) => e.id));
    const mergedEntries = [
      ...convexEntries.filter((e) => !staticIds.has(e.id)),
      ...initialChangeLogEntries,
    ];

    setChangeLogEntries(sortChangeLogEntries(mergedEntries));
  }, [convexEnabled, convexChangelogEntries]);

  const passwordNoticeTimeoutRef = useRef<number | null>(null);
  const changeLogNoticeTimeoutRef = useRef<number | null>(null);
  const previousArticleIndexRef = useRef<number | null>(null);
  const profileVerifyAttemptRef = useRef(false);
  const [enableStickyPanels, setEnableStickyPanels] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(pointer: fine)");
    const update = () => {
      setEnableStickyPanels(query.matches);
    };

    update();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => {
        query.removeEventListener("change", update);
      };
    }

    query.addListener(update);
    return () => {
      query.removeListener(update);
    };
  }, []);

  const selectedArticle = useMemo(() => articles[selectedIndex], [articles, selectedIndex]);
  const originalArticle = useMemo(() => getOriginalArticle(selectedIndex), [getOriginalArticle, selectedIndex]);
  const selectedArticleSummary = useMemo(() => {
    return (
      extractChangeLogSummary(selectedArticle, selectedIndex) ??
      extractChangeLogSummary(originalArticle, selectedIndex)
    );
  }, [originalArticle, selectedArticle, selectedIndex]);
  const selectedArticleSlug = selectedArticleSummary?.slug ?? null;
  // RHF form ref for edit article
  const editArticleFormRef = useRef<UseArticleFormReturn | null>(null);
  // Track edit form values reactively for UI updates
  const [editArticleValues, setEditArticleValues] = useState<SubstanceArticle | undefined>(selectedArticle);
  // Update tracked values when form changes
  const _handleEditArticleMutate = useCallback(() => {
    setNotice(null);
    const values = editArticleFormRef.current?.methods.getValues();
    if (values) {
      setEditArticleValues(values);
    }
  }, [setNotice]);
  const resetEditArticleForm = useCallback((article?: SubstanceArticle) => {
    editArticleFormRef.current?.resetForm(article);
    if (article) {
      setEditArticleValues(article);
    }
  }, []);
  const draftState = useMemo(() => {
    try {
      return { value: fromYaml(editorValue) as unknown, isValid: true };
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
  const originalArticles = useMemo(() => getOriginalArticles(), [getOriginalArticles]);

  const originalAboutMarkdown = useMemo(
    () => getOriginalAboutMarkdown(),
    [getOriginalAboutMarkdown],
  );
  const originalAboutSubtitle = useMemo(
    () => getOriginalAboutSubtitle(),
    [getOriginalAboutSubtitle],
  );
  const originalAboutFounderKeys = useMemo(
    () => getOriginalAboutFounderKeys(),
    [getOriginalAboutFounderKeys],
  );
  const originalGeneratorPrompt = useMemo(
    () => getOriginalGeneratorPrompt(),
    [getOriginalGeneratorPrompt],
  );

  const aboutMarkdownChangelog = useMemo(
    () => buildTextChangelog("About copy", originalAboutMarkdown, aboutMarkdown),
    [aboutMarkdown, originalAboutMarkdown],
  );
  const aboutSubtitleChangelog = useMemo(
    () => buildTextChangelog("About subtitle", originalAboutSubtitle, aboutSubtitle),
    [aboutSubtitle, originalAboutSubtitle],
  );
  const generatorPromptChangelog = useMemo(
    () => buildTextChangelog("Generator prompt", originalGeneratorPrompt, generatorPrompt),
    [generatorPrompt, originalGeneratorPrompt],
  );

  const founderLabelByKey = useMemo(() => {
    const lookup = new Map<string, string>();
    userProfiles.forEach((profile) => {
      lookup.set(profile.key, profile.displayName);
    });
    return lookup;
  }, []);

  const aboutFounderChangelog = useMemo(() => {
    const originalSet = new Set(originalAboutFounderKeys);
    const currentSet = new Set(aboutFounderKeys);
    const additions: string[] = [];
    const removals: string[] = [];

    aboutFounderKeys.forEach((key) => {
      if (!originalSet.has(key)) {
        additions.push(key);
      }
    });

    originalAboutFounderKeys.forEach((key) => {
      if (!currentSet.has(key)) {
        removals.push(key);
      }
    });

    if (additions.length === 0 && removals.length === 0) {
      return {
        markdown: "# About founders\n\nNo differences detected.\n",
        hasChanges: false,
      };
    }

    const lines: string[] = [];

    additions.forEach((key) => {
      const label = founderLabelByKey.get(key) ?? key;
      lines.push(`+ ${label} (@${key.toLowerCase()})`);
    });

    removals.forEach((key) => {
      const label = founderLabelByKey.get(key) ?? key;
      lines.push(`- ${label} (@${key.toLowerCase()})`);
    });

    return {
      markdown: `# About founders\n\n${lines.join("\n")}`,
      hasChanges: true,
    };
  }, [aboutFounderKeys, founderLabelByKey, originalAboutFounderKeys]);

  const psychoactiveManualChangelog = useMemo(() => {
    return buildArticleChangelog(
      "Psychoactive Index Layout",
      getOriginalPsychoactiveIndexManual(),
      psychoactiveIndexManual,
    );
  }, [getOriginalPsychoactiveIndexManual, psychoactiveIndexManual]);

  const datasetChangelog = useMemo(
    () =>
      buildDatasetChangelog({
        articles,
        originalArticles,
        getArticleKey: (article, index) => {
          const summary = extractChangeLogSummary(article, index);
          return summary?.id ?? null;
        },
        formatHeading: (article, index) => formatArticleLabel(article, index),
        summarizeArticle: (article, index) => extractChangeLogSummary(article, index),
      }),
    [articles, originalArticles],
  );
  const hasArticleDatasetChanges = datasetChangelog.sections.length > 0 && datasetChangelog.markdown.trim().length > 0;
  const hasAboutMarkdownChanges = aboutMarkdownChangelog.hasChanges;
  const hasAboutSubtitleChanges = aboutSubtitleChangelog.hasChanges;
  const hasAboutFounderChanges = aboutFounderChangelog.hasChanges;
  const hasManualChanges = psychoactiveManualChangelog.hasChanges;
  const hasGeneratorPromptChanges = generatorPromptChangelog.hasChanges;
  const hasPendingChanges =
    hasArticleDatasetChanges || hasAboutMarkdownChanges || hasAboutSubtitleChanges || hasAboutFounderChanges || hasManualChanges || hasGeneratorPromptChanges;

  const combinedChangelogMarkdown = useMemo(() => {
    const segments: string[] = [];

    if (hasArticleDatasetChanges) {
      segments.push(datasetChangelog.markdown.trimEnd());
    }
    if (hasManualChanges) {
      segments.push(psychoactiveManualChangelog.markdown.trimEnd());
    }
    if (hasAboutMarkdownChanges) {
      segments.push(aboutMarkdownChangelog.markdown.trimEnd());
    }
    if (hasAboutSubtitleChanges) {
      segments.push(aboutSubtitleChangelog.markdown.trimEnd());
    }
    if (hasAboutFounderChanges) {
      segments.push(aboutFounderChangelog.markdown.trimEnd());
    }
    if (hasGeneratorPromptChanges) {
      segments.push(generatorPromptChangelog.markdown.trimEnd());
    }

    if (segments.length === 0) {
      return "# Changes\n\nNo differences detected.\n";
    }

    return segments.join("\n\n---\n\n");
  }, [
    aboutFounderChangelog.markdown,
    aboutFounderChangelog.hasChanges,
    aboutMarkdownChangelog.markdown,
    aboutMarkdownChangelog.hasChanges,
    aboutSubtitleChangelog.markdown,
    aboutSubtitleChangelog.hasChanges,
    datasetChangelog.markdown,
    hasAboutFounderChanges,
    hasAboutMarkdownChanges,
    hasAboutSubtitleChanges,
    hasArticleDatasetChanges,
    hasManualChanges,
    hasGeneratorPromptChanges,
    psychoactiveManualChangelog.markdown,
    generatorPromptChangelog.markdown,
  ]);

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
  const isCommitDisabled = isSaving || !hasStoredCredentials || hasInvalidJsonDraft || !hasPendingChanges;
  // newArticleValues is already a SubstanceArticle, no conversion needed
  const newArticlePayload = newArticleValues;
  const [newArticleJsonDraft, setNewArticleJsonDraft] = useState(() =>
    JSON.stringify(newArticlePayload, null, 2),
  );
  const newArticleJsonUpdateSourceRef = useRef<"form" | "json" | null>(null);
  const [newArticleJsonError, setNewArticleJsonError] = useState<string | null>(null);
  useEffect(() => {
    if (newArticleJsonUpdateSourceRef.current === "json") {
      newArticleJsonUpdateSourceRef.current = null;
      return;
    }

    const formatted = JSON.stringify(newArticlePayload, null, 2);
    newArticleJsonUpdateSourceRef.current = "form";
    setNewArticleJsonDraft((current) => (current === formatted ? current : formatted));
    setNewArticleJsonError(null);
  }, [newArticlePayload]);
  const isNewArticleValid = useMemo(() => {
    const hasTitle = (newArticleValues.title ?? "").trim().length > 0;
    const hasCommonName = (newArticleValues.identification?.common_name ?? "").trim().length > 0;
    const hasRoute = (newArticleValues.dosage?.routes ?? []).some(
      (route) => (route.route ?? "").trim().length > 0,
    );

    return hasTitle && hasCommonName && hasRoute;
  }, [newArticleValues]);
  const isNewArticleJsonValid = newArticleJsonError === null;
  const isCreateCommitDisabled =
    isCommitDisabled || !isNewArticleValid || !isNewArticleJsonValid;
  const _previewMinHeight = useMemo(() => {
    const lines = newArticleJsonDraft.split("\n").length;
    return Math.min(480, Math.max(160, lines * 18));
  }, [newArticleJsonDraft]);
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
  const _hasArticles = articleOptions.length > 0;
  const _articleDeleteTargetLabel = selectedArticleSummary?.title ?? articleLabel;

  const articleFrequency = useMemo(() => buildArticleFrequencyIndex(changeLogEntries), [changeLogEntries]);

  const _selectedArticleHistoryTotal = useMemo(() => {
    if (!selectedArticleSlug) {
      return 0;
    }

    const frequency = articleFrequency.find((entry) => entry.slug === selectedArticleSlug);
    return frequency?.count ?? 0;
  }, [articleFrequency, selectedArticleSlug]);

  const _selectedArticleHistory = useMemo(() => {
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

  const localStorageRef = useRef<Storage | null | false>(null);

  const getSafeLocalStorage = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    if (localStorageRef.current !== null) {
      return localStorageRef.current || null;
    }

    try {
      const { localStorage } = window;
      const probeKey = `${PASSWORD_STORAGE_KEY}-probe`;
      localStorage.setItem(probeKey, "ok");
      localStorage.removeItem(probeKey);
      localStorageRef.current = localStorage;
      return localStorage;
    } catch {
      localStorageRef.current = false;
      return null;
    }
  }, []);

  useEffect(() => {
    const storage = getSafeLocalStorage();
    if (!storage) {
      return;
    }

    try {
      const storedValue = storage.getItem(PASSWORD_STORAGE_KEY);
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
  }, [getSafeLocalStorage]);

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

  const handleChangeLogArticleSelect = useCallback((value: string) => {
    setChangeLogFilters((previous) => ({
      ...previous,
      articleSlug: value === "__all__" ? null : value,
    }));
  }, []);

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

  const changeLogFiltersCardClassName = enableStickyPanels
    ? "w-full space-y-5 bg-white/[0.04] md:sticky md:top-24"
    : "w-full space-y-5 bg-white/[0.04]";

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
      const storage = getSafeLocalStorage();
      if (!storage) {
        return false;
      }

      try {
        const payload: StoredCredentialsRecord = {
          username: record.username,
          password: record.password,
          key: record.key,
          lastVerifiedAt: record.lastVerifiedAt,
        };
        storage.setItem(PASSWORD_STORAGE_KEY, JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    },
    [getSafeLocalStorage],
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
        const authResult = await authMutation.mutateAsync({
          username: candidateUsername,
          password: candidatePassword,
        });

        const matchedKey = authResult.key;
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
    [adminPassword, authMutation, persistCredentialsToLocalStorage, showPasswordNotice, username],
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

    const storage = getSafeLocalStorage();
    if (storage) {
      try {
        storage.removeItem(PASSWORD_STORAGE_KEY);
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


  const _categoryDropdowns = useMemo(() => {
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
    // Reset form when selected article changes
    resetEditArticleForm(selectedArticle);
    if (!selectedArticle) {
      setEditorValue("{}");
    } else {
      setEditorValue(toYaml(selectedArticle));
    }
    setDraftMode("ui");
    if (previousArticleIndexRef.current !== selectedIndex) {
      setNotice(null);
    }
    previousArticleIndexRef.current = selectedIndex;
  }, [resetEditArticleForm, selectedArticle, selectedIndex]);

  useEffect(() => {
    if (draftMode !== "ui") {
      return;
    }

    // Don't update editor if articles haven't loaded yet
    if (!selectedArticle) {
      return;
    }

    // Don't update editor if editArticleValues hasn't been initialized yet
    // (race condition: selectedArticle loads before resetEditArticleForm completes)
    if (!editArticleValues) {
      return;
    }

    // editArticleValues is already a SubstanceArticle
    const merged = mergeArticleWithOriginal(selectedArticle, editArticleValues);
    setEditorValue(toYaml(merged));
  }, [draftMode, editArticleValues, selectedArticle]);

  const _switchToJsonMode = useCallback(() => {
    if (draftMode === "json") {
      return;
    }

    if (!selectedArticle || !editArticleValues) {
      return;
    }

    const merged = mergeArticleWithOriginal(selectedArticle, editArticleValues);
    setEditorValue(toYaml(merged));
    setDraftMode("json");
    setNotice(null);
  }, [draftMode, editArticleValues, selectedArticle]);

  const _switchToUiMode = useCallback(() => {
    if (draftMode === "ui") {
      return;
    }

    try {
      const parsed = fromYaml(editorValue);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Parsed data must be an object");
      }

      // YAML is parsed directly as SubstanceArticle
      resetEditArticleForm(parsed as SubstanceArticle);
      setDraftMode("ui");
      setNotice(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to parse YAML.";
      setNotice({ type: "error", message: `Switch failed: ${reason}` });
    }
  }, [draftMode, editorValue, resetEditArticleForm]);

  const _handleDraftModeChange = useCallback((mode: "ui" | "json") => {
    if (mode === "json") {
      if (draftMode === "json") return;
      if (!selectedArticle || !editArticleValues) return;
      const merged = mergeArticleWithOriginal(selectedArticle, editArticleValues);
      setEditorValue(toYaml(merged));
      setDraftMode("json");
      setNotice(null);
    } else {
      if (draftMode === "ui") return;
      try {
        const parsed = fromYaml(editorValue);
        if (!parsed || typeof parsed !== "object") {
          throw new Error("Parsed data must be an object");
        }
        // YAML is parsed directly as SubstanceArticle
        resetEditArticleForm(parsed as SubstanceArticle);
        setDraftMode("ui");
        setNotice(null);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unable to parse YAML.";
        setNotice({ type: "error", message: `Switch failed: ${reason}` });
      }
    }
  }, [draftMode, editArticleValues, selectedArticle, editorValue, resetEditArticleForm]);

  const _handleEditorChange = useCallback(
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

  const _applyEdits = () => {
    if (!selectedArticle) {
      setNotice({ type: "error", message: "Select an article before saving." });
      return;
    }

    if (hasInvalidJsonDraft) {
      setNotice({ type: "error", message: "Fix YAML syntax before saving." });
      return;
    }

    if (draftMode === "ui") {
      if (!editArticleValues) {
        setNotice({ type: "error", message: "Article data not loaded yet." });
        return;
      }
      // editArticleValues is already a SubstanceArticle
      const merged = mergeArticleWithOriginal(selectedArticle, editArticleValues);
      updateArticleAt(selectedIndex, merged);
      setNotice({ type: "success", message: "Article updated in draft dataset." });
      return;
    }

    try {
      const parsed = fromYaml(editorValue);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Parsed data must be an object");
      }

      updateArticleAt(selectedIndex, parsed as ArticleRecord);
      setNotice({ type: "success", message: "Article updated in draft dataset." });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to parse YAML.";
      setNotice({ type: "error", message: reason });
    }
  };

  const _resetArticle = () => {
    resetArticleAt(selectedIndex);
    const original = getOriginalArticle(selectedIndex);
    // Reset form with original article directly
    resetEditArticleForm(original);
    if (original) {
      setEditorValue(toYaml(original));
    } else {
      setEditorValue("{}");
    }
    setDraftMode("ui");
    setNotice({ type: "success", message: "Article reset to original content." });
  };

  const _resetDataset = () => {
    resetAll();
    setSelectedIndex(0);
    const first = getOriginalArticle(0);
    if (first) {
      setEditorValue(toYaml(first));
    }
    // Reset form with first article directly
    resetEditArticleForm(first);
    setDraftMode("ui");
    setNotice({ type: "success", message: "All articles restored." });
  };

  const _downloadDraft = () => {
    setNotice(null);
    const fileName = `articles-dev-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    // Download as JSON for storage format (articles.json)
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

  const _downloadArticle = () => {
    if (hasInvalidJsonDraft) {
      setNotice({ type: "error", message: "Fix YAML syntax before downloading the article." });
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

  const _copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(articles, null, 2));
      setNotice({ type: "success", message: "Draft JSON copied to clipboard." });
    } catch {
      setNotice({ type: "error", message: "Clipboard copy failed. Try downloading instead." });
    }
  };

  const _copyChangelog = async () => {
    try {
      await navigator.clipboard.writeText(changelogMarkdown);
      setNotice({ type: "success", message: "Diff copied to clipboard." });
    } catch {
      setNotice({ type: "error", message: "Clipboard copy failed. Try downloading instead." });
    }
  };

  const _downloadChangelog = () => {
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

  const handleStageNewArticle = useCallback((): ArticleRecord[] | null => {
    if (!isNewArticleJsonValid) {
      setCreatorNotice({
        type: "error",
        message: `Fix JSON before staging: ${newArticleJsonError ?? "Invalid article JSON."}`,
      });
      return null;
    }

    if (!isNewArticleValid) {
      setCreatorNotice({
        type: "error",
        message: "Complete the required fields (title, drug name, route + units) before staging.",
      });
      return null;
    }

    const existingId = newArticleValues.id;
    const parsedExistingId = typeof existingId === "number" ? existingId : null;
    const hasExistingId = parsedExistingId !== null && Number.isFinite(parsedExistingId);
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

    // Update form with assigned ID
    newArticleFormRef.current?.methods.setValue("id", assignedId);

    // Get the updated values with assigned ID
    const draftPayload: SubstanceArticle = {
      ...newArticleValues,
      id: assignedId,
    };

    let stagedArticles: ArticleRecord[] | null = null;
    applyArticlesTransform((previous) => {
      // TODO: draftPayload is old schema, needs refactoring
      const stagedArticle = draftPayload as unknown as (typeof previous)[number];
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
        stagedArticles = next;
        return next;
      }

      next.push(stagedArticle);
      stagedArticles = next;
      return next;
    });

    if (!stagedArticles) {
      setCreatorNotice({
        type: "error",
        message: "Unable to stage the article. Try again.",
      });
      return null;
    }

    const stagedLabel = (draftPayload.title ?? "").trim() || (draftPayload.identification?.common_name ?? "").trim() || `Article ${assignedId}`;
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

    return stagedArticles;
  }, [
    applyArticlesTransform,
    articles,
    isNewArticleJsonValid,
    newArticleJsonError,
    isNewArticleValid,
    newArticleValues,
    nextAvailableArticleId,
    setCreatorNotice,
    setIsNewArticleStaged,
    setStagedArticleId,
    setStagedArticleLabel,
    stagedArticleId,
  ]);

  // Save articles and About content to Convex (instant sync, no GitHub commit)
  // Requires credential verification just like GitHub commits
  const handleSaveToConvex = useCallback(async () => {
    if (!hasPendingChanges) {
      setConvexNotice({ type: "error", message: "No changes to save." });
      return;
    }

    // Check if we have any Convex-compatible changes (articles or About content)
    const hasAboutChanges = hasAboutMarkdownChanges || hasAboutSubtitleChanges || hasAboutFounderChanges;

    setIsConvexSaving(true);
    setConvexNotice({ type: "success", message: "Verifying credentials…" });

    try {
      // Verify credentials first (same as GitHub flow)
      const credentials = await verifyDevCredentials();

      setConvexNotice({
        type: "success",
        message: `Credentials verified for ${credentials.key}. Saving to Convex…`,
      });

      const savedItems: string[] = [];

      // Save About content if changed
      if (hasAboutChanges) {
        await convexSaveAbout({
          aboutMarkdown: aboutMarkdown,
          aboutSubtitle: aboutSubtitle,
          founderProfileKeys: aboutFounderKeys,
          updatedBy: credentials.key,
        });
        savedItems.push("About page");
      }

      // Get changed articles by comparing with originals
      const changedArticles = articles.filter((article, index) => {
        const original = originalArticles[index];
        if (!original) return true; // New article
        return JSON.stringify(article) !== JSON.stringify(original);
      });

      // Save articles if there are changes and convexSave is available
      if (changedArticles.length > 0 && convexSave) {
        const result = await convexSave.mutate({ articles: changedArticles });
        savedItems.push(`${result.created + result.updated} article(s)`);

        // Generate and save changelog entry
        if (convexChangelogSave && datasetChangelog.sections.length > 0) {
          const now = new Date();
          const entryId = `${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.toTimeString().slice(0, 8).replace(/:/g, "")}-${Math.random().toString(16).slice(2, 10)}`;
          const message = `Dev editor update - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

          await convexChangelogSave.mutate({
            entryId,
            createdAt: now.toISOString(),
            message,
            markdown: datasetChangelog.markdown,
            submittedBy: credentials.key,
            articles: datasetChangelog.articles.map((a) => ({
              id: a.id,
              title: a.title,
              slug: a.slug,
            })),
          });

          // Add the new entry to local state so it appears immediately
          const newEntry: ChangeLogEntry = {
            id: entryId,
            createdAt: now.toISOString(),
            commit: {
              sha: "",
              url: "",
              message,
            },
            articles: datasetChangelog.articles,
            markdown: datasetChangelog.markdown,
            submittedBy: credentials.key,
          };
          setChangeLogEntries((prev) => appendChangeLogEntry(prev, newEntry));
        }
      }

      if (savedItems.length === 0) {
        setConvexNotice({ type: "error", message: "No Convex-compatible changes to save." });
        return;
      }

      setConvexNotice({
        type: "success",
        message: `Saved ${savedItems.join(" and ")} to Convex as ${credentials.key}.`,
      });

      // Clear notice after a delay
      setTimeout(() => setConvexNotice(null), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save to Convex.";
      setConvexNotice({ type: "error", message });
      setTimeout(() => setConvexNotice(null), 10000);
    } finally {
      setIsConvexSaving(false);
    }
  }, [
    articles,
    convexSave,
    convexSaveAbout,
    convexChangelogSave,
    datasetChangelog,
    hasPendingChanges,
    hasAboutMarkdownChanges,
    hasAboutSubtitleChanges,
    hasAboutFounderChanges,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    originalArticles,
    verifyDevCredentials,
  ]);

  const handleSaveToGitHub = useCallback(async () => {
    console.log("[handleSaveToGitHub] Starting commit process...");
    console.log("[handleSaveToGitHub] hasInvalidJsonDraft:", hasInvalidJsonDraft);
    console.log("[handleSaveToGitHub] hasPendingChanges:", hasPendingChanges);
    console.log("[handleSaveToGitHub] Articles count:", articles.length);

    if (hasInvalidJsonDraft) {
      setGithubNotice({ type: "error", message: "Fix YAML syntax before committing." });
      return;
    }

    if (!hasPendingChanges) {
      setGithubNotice({ type: "error", message: "No changes detected to commit." });
      window.setTimeout(() => setGithubNotice(null), 5000);
      return;
    }

    const needsAutoStage = false;
    let articlesForCommit = articles;
    let datasetChangelogForCommit = datasetChangelog;

    if (needsAutoStage) {
      const stagedArticles = handleStageNewArticle();
      if (!stagedArticles) {
        setGithubNotice({
          type: "error",
          message: "Staging failed. Fix the issues noted above and try again.",
        });
        window.setTimeout(() => setGithubNotice(null), 10000);
        return;
      }

      articlesForCommit = stagedArticles;
      datasetChangelogForCommit = buildDatasetChangelog({
        articles: stagedArticles,
        originalArticles,
        getArticleKey: (article, index) => {
          const summary = extractChangeLogSummary(article, index);
          return summary?.id ?? null;
        },
        formatHeading: (article, index) => formatArticleLabel(article, index),
        summarizeArticle: (article, index) => extractChangeLogSummary(article, index),
      });
    }

    const manualChangelog = psychoactiveManualChangelog;

    const segments: string[] = [];
    const trimmedDatasetMarkdown = datasetChangelogForCommit.markdown.trim();

    if (trimmedDatasetMarkdown.length > 0) {
      segments.push(trimmedDatasetMarkdown);
    }

    if (manualChangelog.hasChanges) {
      segments.push(manualChangelog.markdown.trim());
    }

    if (aboutMarkdownChangelog.hasChanges) {
      segments.push(aboutMarkdownChangelog.markdown.trim());
    }

    if (aboutSubtitleChangelog.hasChanges) {
      segments.push(aboutSubtitleChangelog.markdown.trim());
    }

    if (aboutFounderChangelog.hasChanges) {
      segments.push(aboutFounderChangelog.markdown.trim());
    }

    const combinedMarkdown = segments.length > 0 ? `${segments.join("\n\n---\n\n")}\n` : "";

    const commitMessage = `Dev editor update - ${new Date().toLocaleString()}`;

    try {
      setGithubNotice({ type: "success", message: "Verifying credentials…" });

      const credentials = await verifyDevCredentials();

      setGithubNotice({
        type: "success",
        message: `Credentials verified for ${credentials.key}. Saving to GitHub…`,
      });

      console.log("[handleSaveToGitHub] Credentials verified, calling saveArticlesMutation...");
      console.log("[handleSaveToGitHub] Changed articles:", datasetChangelogForCommit.articles);

      // When Convex is enabled, skip articles in GitHub commit (articles managed via Convex)
      const skipArticles = isConvexEnabled();
      
      const result = await saveArticlesMutation.mutateAsync({
        username: credentials.username,
        password: credentials.password,
        articlesData: articlesForCommit,
        commitMessage,
        changelogMarkdown: combinedMarkdown,
        changedArticles: datasetChangelogForCommit.articles,
        psychoactiveIndexManualData: psychoactiveIndexManual,
        aboutMarkdown,
        aboutSubtitleMarkdown: aboutSubtitle,
        aboutConfig: { founderProfileKeys: aboutFounderKeys },
        generatorPrompt: hasGeneratorPromptChanges ? generatorPrompt : undefined,
        skipArticles,
      });

      const resolvedKey = result.submittedBy?.trim() || credentials.key;
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
      console.error("[handleSaveToGitHub] Save failed:", error);
      if (error instanceof Error) {
        console.error("[handleSaveToGitHub] Error message:", error.message);
        console.error("[handleSaveToGitHub] Stack trace:", error.stack);
      }
      const reason = error instanceof Error ? error.message : "Unexpected error.";
      setGithubNotice({ type: "error", message: reason });
    } finally {
      window.setTimeout(() => setGithubNotice(null), 10000);
    }
  }, [
    activeTab,
    appendChangeLogEntry,
    articles,
    datasetChangelog,
    handleStageNewArticle,
    hasInvalidJsonDraft,
    hasPendingChanges,
    isNewArticleStaged,
    onTabChange,
    psychoactiveIndexManual,
    psychoactiveManualChangelog,
    aboutMarkdownChangelog,
    aboutSubtitleChangelog,
    aboutFounderChangelog,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    generatorPrompt,
    hasGeneratorPromptChanges,
    originalArticles,
    pushChangeLogNotice,
    getOriginalPsychoactiveIndexManual,
    setPasswordKey,
    verifyDevCredentials,
    saveArticlesMutation,
  ]);

  const _handleDeleteArticle = useCallback(async () => {
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
        originalArticles,
        getArticleKey: (article, index) => {
          const summary = extractChangeLogSummary(article, index);
          return summary?.id ?? null;
        },
        formatHeading: (article, index) => formatArticleLabel(article, index),
        summarizeArticle: (article, index) => extractChangeLogSummary(article, index),
      });

      // When Convex is enabled, skip articles in GitHub commit (articles managed via Convex)
      const skipArticlesForDeletion = isConvexEnabled();
      
      const result = await saveArticlesMutation.mutateAsync({
        username: credentials.username,
        password: credentials.password,
        articlesData: nextArticles,
        commitMessage,
        changelogMarkdown: deletionChangelog.markdown,
        changedArticles: deletionChangelog.articles,
        skipArticles: skipArticlesForDeletion,
      });

      const resolvedKey = result.submittedBy?.trim() || credentials.key;
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
    originalArticles,
    isDeletingArticle,
    onTabChange,
    pushChangeLogNotice,
    replaceArticles,
    saveArticlesMutation,
    selectedArticle,
    selectedArticleSummary,
    selectedIndex,
    setChangeLogEntries,
    setPasswordKey,
    setSelectedIndex,
    verifyDevCredentials,
  ]);

  const activePrimaryTab = useMemo(() => resolvePrimaryTab(activeTab), [activeTab]);
  const isIndexLayoutTab = activeTab === "index-layout";
  const mainClassName = isIndexLayoutTab
    ? "w-full px-4 py-12 text-white md:px-6 lg:px-8"
    : "mx-auto w-full max-w-6xl px-4 py-12 text-white md:px-6 lg:px-8";
  const contentWrapperClass = isIndexLayoutTab ? "mt-10 w-full" : "mx-auto w-full max-w-6xl";

  const clearNoticesForTab = useCallback(
    (tab: DevModeTab) => {
      if (tab === "tag-editor" || tab === "index-layout") {
        setCreatorNotice(null);
      }
      if (tab === "tag-editor") {
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

  const handlePrimaryTabChange = useCallback(
    (primaryTab: DevModePrimaryTab) => {
      const nextTab = devModePrimaryDefaults[primaryTab];
      handleTabChange(nextTab);
    },
    [handleTabChange],
  );

  const compoundCount = substanceRecords.length;
  const psychoactiveClassCount = dosageCategoryGroups.length;
  const chemicalClassCount = chemicalClassIndexGroups.length;
  const mechanismClassCount = mechanismIndexGroups.length;
  const effectCount = effectSummaries.length;

  const aboutPlaceholderValues = useMemo(() => {
    const formatCount = (value: number) => value.toLocaleString();
    return {
      compoundCount: formatCount(compoundCount),
      psychoactiveClassCount: formatCount(psychoactiveClassCount),
      categoryCount: formatCount(psychoactiveClassCount),
      chemicalClassCount: formatCount(chemicalClassCount),
      mechanismClassCount: formatCount(mechanismClassCount),
      mechanismOfActionClassCount: formatCount(mechanismClassCount),
      effectCount: formatCount(effectCount),
    };
  }, [chemicalClassCount, compoundCount, effectCount, mechanismClassCount, psychoactiveClassCount]);

  useEffect(() => {
    if (activeTab === "profile" && !hasStoredCredentials) {
      handleTabChange("articles");
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

  const _resetNewArticleForm = useCallback(() => {
    resetNewArticleFormState();
    setCreatorNotice({ type: "success", message: "New article form reset." });
    setIsNewArticleStaged(false);
    setStagedArticleLabel(null);
    setStagedArticleId(null);
    setCreateDraftMode("ui");
  }, [
    resetNewArticleFormState,
    setCreatorNotice,
    setIsNewArticleStaged,
    setStagedArticleLabel,
    setStagedArticleId,
    setCreateDraftMode,
  ]);

  const _handleNewArticleJsonChange = useCallback(
    (value: string) => {
      newArticleJsonUpdateSourceRef.current = "json";
      setNewArticleJsonDraft(value);

      try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Article JSON must be an object.");
        }

        // JSON is parsed directly as SubstanceArticle
        newArticleFormRef.current?.resetForm(parsed as SubstanceArticle);
        setNewArticleValues(parsed as SubstanceArticle);
        setNewArticleJsonError(null);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unable to parse JSON.";
        setNewArticleJsonError(reason);
        newArticleJsonUpdateSourceRef.current = null;
      }
    },
    [],
  );

  const _switchToCreateJsonMode = useCallback(() => {
    if (createDraftMode === "json") {
      return;
    }

    setCreateDraftMode("json");
    setCreatorNotice(null);
  }, [createDraftMode, setCreatorNotice]);

  const _switchToCreateUiMode = useCallback(() => {
    if (createDraftMode === "ui") {
      return;
    }

    try {
      const parsed = JSON.parse(newArticleJsonDraft);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Article JSON must be an object.");
      }

      // JSON is parsed directly as SubstanceArticle
      newArticleFormRef.current?.resetForm(parsed as SubstanceArticle);
      setNewArticleValues(parsed as SubstanceArticle);
      setCreateDraftMode("ui");
      setCreatorNotice(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to parse JSON.";
      setCreatorNotice({ type: "error", message: `Switch failed: ${reason}` });
    }
  }, [createDraftMode, newArticleJsonDraft, setCreatorNotice]);

  const _handleCreateDraftModeChange = useCallback((mode: "ui" | "json") => {
    if (mode === "json") {
      if (createDraftMode === "json") return;
      setCreateDraftMode("json");
      setCreatorNotice(null);
    } else {
      if (createDraftMode === "ui") return;
      try {
        const parsed = JSON.parse(newArticleJsonDraft);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Article JSON must be an object.");
        }
        // JSON is parsed directly as SubstanceArticle
        newArticleFormRef.current?.resetForm(parsed as SubstanceArticle);
        setNewArticleValues(parsed as SubstanceArticle);
        setCreateDraftMode("ui");
        setCreatorNotice(null);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unable to parse JSON.";
        setCreatorNotice({ type: "error", message: `Switch failed: ${reason}` });
      }
    }
  }, [createDraftMode, newArticleJsonDraft, setCreatorNotice]);

  const _copyNewArticleJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(newArticleJsonDraft);
      setCreatorNotice({ type: "success", message: "New article JSON copied to clipboard." });
    } catch {
      setCreatorNotice({ type: "error", message: "Clipboard copy failed. Try downloading instead." });
    }
  }, [newArticleJsonDraft]);

  const _downloadNewArticleJson = useCallback(() => {
    const baseLabel = (newArticleValues.title ?? "").trim() || (newArticleValues.identification?.common_name ?? "").trim() || "new-substance";
    const slug = toFileSlug(baseLabel || "new-substance");
    const fileName = `new-article-${slug || "record"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const blob = new Blob([newArticleJsonDraft], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setCreatorNotice({ type: "success", message: "New article JSON downloaded." });
  }, [newArticleValues.identification?.common_name, newArticleValues.title, newArticleJsonDraft]);

  const _handleClassificationChange = (value: string) => {
    if (!value) {
      return;
    }

    const nextValue = classificationOptions.find((option) => option.value === value)?.value;
    if (!nextValue) {
      return;
    }

    setClassificationView(nextValue);
  };

  const [_categoryJumpKey, setCategoryJumpKey] = useState(0);

  const _handleCategoryJump = (value: string) => {
    if (!value) {
      return;
    }

    const nextIndex = Number(value);
    if (Number.isNaN(nextIndex)) {
      return;
    }

    setArticleDeleteNotice(null);
    setSelectedIndex(nextIndex);
    setCategoryJumpKey((prev) => prev + 1);
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
    await navigator.clipboard.writeText(combinedChangelogMarkdown);
  }, [combinedChangelogMarkdown]);

  const downloadDatasetMarkdownForTagEditor = useCallback(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `dataset-changelog-${timestamp}.diff`;
    const blob = new Blob([combinedChangelogMarkdown], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [combinedChangelogMarkdown]);

  const handleAboutMarkdownChange = useCallback((value: string) => {
    replaceAboutMarkdown(value);
  }, [replaceAboutMarkdown]);

  const handleAboutMarkdownReset = useCallback(() => {
    resetAboutMarkdown();
  }, [resetAboutMarkdown]);

  const handleAboutMarkdownCopy = useCallback(() => {
    navigator.clipboard.writeText(aboutMarkdown).catch((error) => {
      console.error('Failed to copy About markdown', error);
    });
  }, [aboutMarkdown]);

  const handleAboutSubtitleChange = useCallback((value: string) => {
    replaceAboutSubtitle(value);
  }, [replaceAboutSubtitle]);

  const handleAboutSubtitleReset = useCallback(() => {
    resetAboutSubtitle();
  }, [resetAboutSubtitle]);

  const handleAboutSubtitleCopy = useCallback(() => {
    navigator.clipboard.writeText(aboutSubtitle).catch((error) => {
      console.error('Failed to copy About subtitle', error);
    });
  }, [aboutSubtitle]);

  const handleGeneratorPromptChange = useCallback((value: string) => {
    replaceGeneratorPrompt(value);
  }, [replaceGeneratorPrompt]);

  const handleGeneratorPromptReset = useCallback(() => {
    resetGeneratorPrompt();
  }, [resetGeneratorPrompt]);

  const handleGeneratorPromptCopy = useCallback(() => {
    navigator.clipboard.writeText(generatorPrompt).catch((error) => {
      console.error('Failed to copy generator prompt', error);
    });
  }, [generatorPrompt]);

  const canonicalizeFounderKeyList = useCallback((keys: readonly string[]) => {
    const seen = new Set<string>();
    const next: string[] = [];

    keys.forEach((entry) => {
      if (typeof entry !== 'string') {
        return;
      }

      const trimmed = entry.trim();
      if (!trimmed) {
        return;
      }

      const normalized = trimmed.toLowerCase();
      if (seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      next.push(trimmed);
    });

    return next;
  }, []);

  const handleAboutFounderToggle = useCallback((rawKey: string) => {
    if (typeof rawKey !== 'string') {
      return;
    }

    const trimmedKey = rawKey.trim();
    if (!trimmedKey) {
      return;
    }

    const normalizedKey = trimmedKey.toLowerCase();
    const normalizedExisting = aboutFounderKeys.map((entry) => entry.trim().toLowerCase());
    const hasKey = normalizedExisting.includes(normalizedKey);

    if (hasKey) {
      const filtered = aboutFounderKeys.filter((entry, index) => normalizedExisting[index] !== normalizedKey);
      replaceAboutFounderKeys(canonicalizeFounderKeyList(filtered));
      return;
    }

    replaceAboutFounderKeys(canonicalizeFounderKeyList([...aboutFounderKeys, trimmedKey]));
  }, [aboutFounderKeys, canonicalizeFounderKeyList, replaceAboutFounderKeys]);

  const handleAboutFounderReset = useCallback(() => {
    resetAboutFounderKeys();
  }, [resetAboutFounderKeys]);

  // Convex save button (requires authentication via handleSaveToConvex)
  const convexSaveButton = isConvexEnabled() ? (
    <div className="flex items-center gap-2">
      {convexNotice && (
        <span className={`text-xs ${convexNotice.type === "error" ? "text-rose-300" : "text-emerald-300"}`}>
          {convexNotice.message}
        </span>
      )}
      <Button
        variant="outline"
        size="pill"
        className="rounded-full border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200"
        onClick={handleSaveToConvex}
        disabled={isConvexSaving || !hasPendingChanges}
      >
        <Icon icon="lucide:cloud" size={16} />
        {isConvexSaving ? "Saving…" : "Save to Convex"}
      </Button>
    </div>
  ) : null;

  const commitPanel = (
    <DevCommitCard
      notice={githubNotice}
      trimmedAdminPassword={trimmedAdminPassword}
      passwordKey={passwordKey}
      hasInvalidJsonDraft={hasInvalidJsonDraft}
      isSaving={isSaving}
      isCommitDisabled={isCommitDisabled}
      onCommit={handleSaveToGitHub}
      actionSlot={convexSaveButton}
    />
  );

  const renderCommitPanel = useCallback(
    (extraActionSlot?: React.ReactNode) => (
      <DevCommitCard
        notice={githubNotice}
        trimmedAdminPassword={trimmedAdminPassword}
        passwordKey={passwordKey}
        hasInvalidJsonDraft={hasInvalidJsonDraft}
        isSaving={isSaving}
        isCommitDisabled={isCommitDisabled}
        onCommit={handleSaveToGitHub}
        actionSlot={
          <div className="flex flex-wrap items-center gap-2">
            {convexSaveButton}
            {extraActionSlot}
          </div>
        }
      />
    ),
    [githubNotice, trimmedAdminPassword, passwordKey, hasInvalidJsonDraft, isSaving, isCommitDisabled, handleSaveToGitHub, convexSaveButton]
  );

  const _createCommitPanel = (
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
          <span>Commit will auto-stage this draft when validation passes.</span>
        )
      }
    />
  );

  // Show loading state while articles are loading
  console.log("[DevModePage] Render - articles.length:", articles.length);
  if (articles.length === 0) {
    console.log("[DevModePage] Showing loading state (articles.length === 0)");
    return (
      <main className={mainClassName}>
        <div className="mx-auto w-full max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-display mt-4 flex items-center justify-center gap-3 text-[2.25rem] font-bold tracking-tight text-fuchsia-300 sm:text-[2.7rem]">
              <Icon icon="lucide:wrench" size={32} className="text-current" />
              <span>Dev Tools</span>
            </h1>
          </div>
          <div className="mt-20 flex flex-col items-center justify-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
            <p className="text-sm text-white/60">Loading articles...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={mainClassName}>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display mt-4 flex items-center justify-center gap-3 text-[2.25rem] font-bold tracking-tight text-fuchsia-300 sm:text-[2.7rem]">
            <Icon icon="lucide:wrench" size={32} className="text-current" />
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
                  <Input
                    id="dev-mode-saved-username"
                    type="text"
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
                    <Input
                      id="dev-mode-saved-password"
                      type={isPasswordVisible ? "text" : "password"}
                      className="pr-12"
                      placeholder="Paste your user password"
                      autoComplete="current-password"
                      value={passwordDraft}
                      onChange={(event) => setPasswordDraft(event.target.value)}
                      onKeyDown={handleCredentialInputKeyDown}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute inset-y-0 right-3 my-auto h-8 w-8"
                      onClick={() => setIsPasswordVisible((prev) => !prev)}
                      aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                    >
                      {isPasswordVisible ? <Icon icon="lucide:eye-off" size={16} /> : <Icon icon="lucide:eye" size={16} />}
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                type="submit"
                variant="default"
                size="pill"
                className="rounded-full"
                disabled={isVerifyingCredentials}
              >
                {isVerifyingCredentials ? (
                  <Icon icon="lucide:loader-2" size={16} className="animate-spin" />
                ) : (
                  <Icon icon="lucide:save" size={16} />
                )}
                {isVerifyingCredentials ? "Verifying…" : "Save"}
              </Button>
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
                  <Icon icon="lucide:badge-check" size={16} />
                  <span>Logged in as {passwordKey}</span>
                  <span className="text-emerald-200/75">• Verified {verifiedBadgeText ?? "just now"}</span>
                </div>
              ) : hasStoredCredentials ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-medium text-white/70">
                  <Icon icon="lucide:refresh-cw" size={16} />
                  <span>Credentials stored. Save to verify.</span>
                </div>
              ) : (
                <div className="text-white/45">Not logged in.</div>
              )}
              {hasStoredCredentials && (
                <Button
                  variant="outline"
                  size="xs"
                  className="self-start rounded-full"
                  onClick={handleLogout}
                  disabled={isVerifyingCredentials}
                >
                  <Icon icon="lucide:log-out" size={16} />
                  Log out
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex w-full flex-col items-center gap-4">
        <div className="flex w-full flex-wrap justify-center gap-2 rounded-3xl border border-white/10 bg-white/5 p-1 shadow-inner shadow-black/20 sm:w-auto sm:flex-nowrap sm:gap-0">
          <Button
            variant="tabPrimary"
            size="tabPrimary"
            onClick={() => handlePrimaryTabChange("tools")}
            data-active={activePrimaryTab === "tools"}
            aria-pressed={activePrimaryTab === "tools"}
          >
            <Icon icon="lucide:wrench" size={16} />
            <span>TOOLS</span>
          </Button>
          <Button
            variant="tabPrimary"
            size="tabPrimary"
            onClick={() => handlePrimaryTabChange("change-log")}
            data-active={activePrimaryTab === "change-log"}
            aria-pressed={activePrimaryTab === "change-log"}
          >
            <Icon icon="lucide:scroll-text" size={16} />
            <span>CHANGE LOG</span>
          </Button>
          <Button
            variant={hasStoredCredentials ? "tabPrimary" : "tabPrimaryDisabled"}
            size="tabPrimary"
            onClick={() => {
              if (hasStoredCredentials) {
                handlePrimaryTabChange("profile");
              }
            }}
            data-active={activePrimaryTab === "profile"}
            aria-pressed={activePrimaryTab === "profile"}
            disabled={!hasStoredCredentials}
          >
            <Icon icon="lucide:user-round" size={16} />
            <span>PROFILE</span>
          </Button>
        </div>

        {activePrimaryTab === "tools" && (
          <div className="flex w-full flex-wrap justify-center gap-2 rounded-3xl border border-white/10 bg-white/5 p-1 shadow-inner shadow-black/20 sm:w-auto sm:flex-nowrap sm:gap-0">
            <Button
              variant="tabSecondary"
              size="tabSecondary"
              onClick={() => handleTabChange("articles")}
              data-active={activeTab === "articles"}
              aria-pressed={activeTab === "articles"}
            >
              <Icon icon="lucide:sparkles" size={16} />
              <span>Substance Articles</span>
            </Button>
            <Button
              variant="tabSecondary"
              size="tabSecondary"
              onClick={() => handleTabChange("tag-editor")}
              data-active={activeTab === "tag-editor"}
              aria-pressed={activeTab === "tag-editor"}
            >
              <Icon icon="lucide:tags" size={16} />
              <span>Tags</span>
            </Button>
            <Button
              variant="tabSecondary"
              size="tabSecondary"
              onClick={() => handleTabChange("about")}
              data-active={activeTab === "about"}
              aria-pressed={activeTab === "about"}
            >
              <Icon icon="lucide:file-text" size={16} />
              <span>About</span>
            </Button>
            <Button
              variant="tabSecondary"
              size="tabSecondary"
              onClick={() => handleTabChange("index-layout")}
              data-active={activeTab === "index-layout"}
              aria-pressed={activeTab === "index-layout"}
            >
              <Icon icon="lucide:layout-dashboard" size={16} />
              <span>Index layout</span>
            </Button>
          </div>
        )}
      </div>
      </div>

      <div className={contentWrapperClass}>
        {activeTab === "change-log" ? (
        <div className="mt-10 grid w-full gap-6 md:grid-cols-[19rem,1fr]">
          <div className="space-y-6 min-w-0">
            <SectionCard className={changeLogFiltersCardClassName}>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-fuchsia-200">Refine history</h2>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="change-log-article">
                  Article
                </label>
                <Select
                  value={changeLogFilters.articleSlug ?? "__all__"}
                  onValueChange={handleChangeLogArticleSelect}
                >
                  <SelectTrigger id="change-log-article">
                    <SelectValue placeholder="All articles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All articles</SelectItem>
                    {changeLogArticleOptions.map((option) => (
                      <SelectItem key={option.slug} value={option.slug}>
                        {option.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="change-log-start">
                    Start date
                  </label>
                  <Input
                    id="change-log-start"
                    type="date"
                    value={changeLogFilters.startDate ?? ""}
                    onChange={handleChangeLogDateChange("startDate")}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="change-log-end">
                    End date
                  </label>
                  <Input
                    id="change-log-end"
                    type="date"
                    value={changeLogFilters.endDate ?? ""}
                    onChange={handleChangeLogDateChange("endDate")}
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
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="change-log-search">
                  Search
                </label>
                <Input
                  id="change-log-search"
                  type="search"
                  placeholder="Find commits by keyword or diff copy…"
                  value={changeLogFilters.searchQuery}
                  onChange={handleChangeLogSearchChange}
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
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={clearChangeLogFilters}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-6 min-w-0">
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

            <SectionCard className="min-w-0 space-y-4 bg-white/[0.04]">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-fuchsia-200">GitHub commits</h2>
              </div>

              {filteredChangeLogEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950 px-6 py-16 text-center">
                  <Icon icon="lucide:wrench" size={40} className="mb-4 text-white/40" />
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
                          <Button
                            variant="glass"
                            size="xs"
                            className="rounded-full"
                            onClick={() => handleCopyChangeLogEntry(entry)}
                          >
                            <Icon icon="lucide:copy" size={16} />
                            Copy diff
                          </Button>
                          <Button
                            variant="glass"
                            size="xs"
                            className="rounded-full"
                            onClick={() => handleDownloadChangeLogEntry(entry)}
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
      ) : activeTab === "profile" ? (
        <ProfileEditorTab
          profile={profileData}
          profileHistory={profileHistory}
          verifyCredentials={verifyDevCredentials}
          onProfileUpdated={handleProfileUpdated}
          hasStoredCredentials={hasStoredCredentials}
        />
      ) : activeTab === "index-layout" ? (
        <IndexLayoutTab
          commitPanel={commitPanel}
        />
      ) : activeTab === "about" ? (
        <AboutEditorTab
          aboutMarkdown={aboutMarkdown}
          originalAboutMarkdown={originalAboutMarkdown}
          onMarkdownChange={handleAboutMarkdownChange}
          onResetMarkdown={handleAboutMarkdownReset}
          aboutSubtitle={aboutSubtitle}
          originalAboutSubtitle={originalAboutSubtitle}
          onSubtitleChange={handleAboutSubtitleChange}
          onResetSubtitle={handleAboutSubtitleReset}
          aboutFounderKeys={aboutFounderKeys}
          originalFounderKeys={originalAboutFounderKeys}
          onToggleFounderKey={handleAboutFounderToggle}
          onResetFounderKeys={handleAboutFounderReset}
          availableProfiles={userProfiles}
          markdownDiff={aboutMarkdownChangelog.markdown}
          subtitleDiff={aboutSubtitleChangelog.markdown}
          subtitleHasChanges={aboutSubtitleChangelog.hasChanges}
          onCopyMarkdown={handleAboutMarkdownCopy}
          onCopySubtitle={handleAboutSubtitleCopy}
          commitPanel={commitPanel}
          placeholderValues={aboutPlaceholderValues}
        />
      ) : activeTab === "tag-editor" ? (
        <TagEditorTab
          commitPanel={commitPanel}
          datasetMarkdown={combinedChangelogMarkdown}
          hasDatasetChanges={hasPendingChanges}
          onCopyDatasetMarkdown={copyDatasetMarkdownForTagEditor}
          onDownloadDatasetMarkdown={downloadDatasetMarkdownForTagEditor}
        />
      ) : activeTab === "articles" ? (
        <SubstanceEditorTab
          generatorPrompt={generatorPrompt}
          originalGeneratorPrompt={originalGeneratorPrompt}
          onPromptChange={handleGeneratorPromptChange}
          onResetPrompt={handleGeneratorPromptReset}
          promptDiff={generatorPromptChangelog.markdown}
          promptHasChanges={generatorPromptChangelog.hasChanges}
          onCopyPrompt={handleGeneratorPromptCopy}
          renderCommitPanel={renderCommitPanel}
        />
      ) : null}
      </div>
    </main>
  );
}
