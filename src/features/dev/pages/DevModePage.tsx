import { Icon } from "@/components/common/Icon";
import { AppImage } from "@/components/common/AppImage";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
import { useSaveArticlesMutation, useSaveToConvexMutation } from "@/hooks/useApiMutations";
import { isConvexEnabled } from "@/lib/convex";
import { useQuery as useConvexQuery } from "convex/react";
import { signOut, useSession } from "next-auth/react";
import { api } from "../../../../convex/_generated/api";
import type { SubstanceArticle } from "@/schema";
import { canAccessDev } from "@/lib/auth/roles";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  type: "success" | "error" | "pending";
  message: string;
  actionHref?: string;
  actionLabel?: string;
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

const classificationOptions = [
  { value: "psychoactive", label: "Psychoactive class" },
  { value: "chemical", label: "Chemical class" },
  { value: "mechanism", label: "Mechanism of action class" },
] as const;

type ClassificationView = (typeof classificationOptions)[number]["value"];

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
    markChangesSaved,
  } = useDevMode();

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
  const [, setPasswordNotice] = useState<ChangeNotice | null>(null);
  const [passwordKey, setPasswordKey] = useState<string | null>(null);
  const [, setLastVerifiedAt] = useState<string | null>(null);
  const [githubNotice, setGithubNotice] = useState<ChangeNotice | null>(null);
  const saveArticlesMutation = useSaveArticlesMutation();
  const saveToConvexMutation = useSaveToConvexMutation();
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
  // Include articles.length as dependency to force recompute when articles first load
  // (getOriginalArticles is stable, but originalArticlesRef.current changes after sync effect)
  const originalArticles = useMemo(
    () => getOriginalArticles(),
    [getOriginalArticles, articles.length],
  );

  // Include current values as dependencies to force recompute when data loads from Convex
  const originalAboutMarkdown = useMemo(
    () => getOriginalAboutMarkdown(),
    [getOriginalAboutMarkdown, aboutMarkdown],
  );
  const originalAboutSubtitle = useMemo(
    () => getOriginalAboutSubtitle(),
    [getOriginalAboutSubtitle, aboutSubtitle],
  );
  const originalAboutFounderKeys = useMemo(
    () => getOriginalAboutFounderKeys(),
    [getOriginalAboutFounderKeys, aboutFounderKeys],
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

  const nextSession = useSession();
  const nextSessionRole = nextSession.data?.user?.role;
  const hasNextEditorSession = nextSession.status === "authenticated" && canAccessDev(nextSessionRole);
  const nextSessionProfileKey = useMemo(() => {
    const email = nextSession.data?.user?.email?.trim() ?? "";
    if (email) {
      const localPart = email.split("@")[0]?.trim() ?? "";
      const normalized = localPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();
      if (normalized) {
        return normalized;
      }
    }

    const name = nextSession.data?.user?.name?.trim() ?? "";
    return name ? name.replace(/[^a-z0-9-]/gi, "").toUpperCase() : "";
  }, [nextSession.data?.user?.email, nextSession.data?.user?.name]);
  const canonicalProfileKey =
    typeof passwordKey === "string" && passwordKey.trim().length > 0
      ? passwordKey.trim().toUpperCase()
      : nextSessionProfileKey.length > 0
        ? nextSessionProfileKey
        : "";
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

  const hasStoredCredentials = hasNextEditorSession;
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

  const verifyDevCredentials = useCallback(
    async () => {
      if (hasNextEditorSession) {
        const matchedKey = nextSessionProfileKey || "EDITOR";
        const verifiedAt = new Date().toISOString();
        const authSessionCredential = "__AUTHJS_SESSION__";

        setPasswordKey(matchedKey);
        setLastVerifiedAt(verifiedAt);
        setPasswordNotice({ type: "success", message: `Using Auth.js session for ${matchedKey}.` });
        passwordNoticeTimeoutRef.current = window.setTimeout(() => {
          setPasswordNotice(null);
          passwordNoticeTimeoutRef.current = null;
        }, 4000);

        return {
          username: matchedKey,
          password: authSessionCredential,
          key: matchedKey,
        };
      }

      const message = "Sign in before continuing.";
      setPasswordNotice({ type: "error", message });
      passwordNoticeTimeoutRef.current = window.setTimeout(() => {
        setPasswordNotice(null);
        passwordNoticeTimeoutRef.current = null;
      }, 4000);
      throw new Error(message);
    },
    [hasNextEditorSession, nextSessionProfileKey],
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
      const handleKeydown = (event: globalThis.KeyboardEvent) => {
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
    // Download as JSON for storage format (SubstanceIndex.json)
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
    setConvexNotice({ type: "pending", message: "Verifying credentials…" });

    try {
      const credentials = await verifyDevCredentials();

      setConvexNotice({
        type: "pending",
        message: `Credentials verified for ${credentials.key}. Saving to Convex…`,
      });

      // Get fresh original articles from ref (not the stale memoized value which may have been computed before articles loaded)
      const freshOriginalArticles = getOriginalArticles();

      // Get changed articles by comparing with originals
      const changedArticles = articles.filter((article, index) => {
        const original = freshOriginalArticles[index];
        if (!original) return true; // New article
        return JSON.stringify(article) !== JSON.stringify(original);
      });

      const result = await saveToConvexMutation.mutateAsync({
        articles: changedArticles,
        about: hasAboutChanges
          ? {
              aboutMarkdown,
              aboutSubtitle,
              founderProfileKeys: aboutFounderKeys,
            }
          : undefined,
        changelog:
          changedArticles.length > 0 && datasetChangelog.sections.length > 0
            ? {
                markdown: datasetChangelog.markdown,
                articles: datasetChangelog.articles.map((article) => ({
                  id: article.id,
                  title: article.title,
                  slug: article.slug,
                })),
              }
            : undefined,
      });

      const resolvedKey = result.submittedBy?.trim() || credentials.key;
      setPasswordKey(resolvedKey);

      if (result.entry) {
        const newEntry: ChangeLogEntry = {
          id: result.entry.id,
          createdAt: result.entry.createdAt,
          commit: {
            sha: result.entry.commit.sha,
            url: result.entry.commit.url,
            message: result.entry.commit.message,
          },
          articles: result.entry.articles,
          markdown: result.entry.markdown,
          submittedBy: result.entry.submittedBy,
        };
        setChangeLogEntries((prev) => appendChangeLogEntry(prev, newEntry));
      }

      if (result.savedItems.length === 0) {
        setConvexNotice({ type: "error", message: "No Convex-compatible changes to save." });
        return;
      }

      if (result.warnings && result.warnings.length > 0) {
        console.warn("[handleSaveToConvex] Convex save warnings:", result.warnings);
        setConvexNotice({
          type: "error",
          message: `Saved ${result.savedItems.join(" and ")} to Convex as ${resolvedKey}, but ${result.warnings.length} issue(s) occurred.`,
        });
        setTimeout(() => setConvexNotice(null), 10000);
        return;
      }

      setConvexNotice({
        type: "success",
        message: `Saved ${result.savedItems.join(" and ")} to Convex as ${resolvedKey}.`,
      });

      // Reset local edits flag so future Convex syncs don't skip
      markChangesSaved();

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
    datasetChangelog,
    hasPendingChanges,
    hasAboutMarkdownChanges,
    hasAboutSubtitleChanges,
    hasAboutFounderChanges,
    aboutMarkdown,
    aboutSubtitle,
    aboutFounderKeys,
    saveToConvexMutation,
    verifyDevCredentials,
    getOriginalArticles,
    markChangesSaved,
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
      setGithubNotice({ type: "pending", message: "Verifying credentials…" });

      const credentials = await verifyDevCredentials();

      setGithubNotice({
        type: "pending",
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

      setGithubNotice({
        type: "success",
        message: result.commitUrl ? "Saved to GitHub." : "Saved to GitHub.",
        actionHref: result.commitUrl,
        actionLabel: result.commitUrl ? "Open commit" : undefined,
      });

      if (result.entry && typeof result.entry === "object") {
        const entry = result.entry as unknown as ChangeLogEntry;
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
        const entry = result.entry as unknown as ChangeLogEntry;
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
        <span className={`text-xs ${convexNotice.type === "error" ? "text-rose-300" : convexNotice.type === "pending" ? "text-cyan-200" : "text-emerald-300"}`}>
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

  const primaryCommitNotice = isConvexEnabled() ? convexNotice : githubNotice;

  const commitPanel = (
    <DevCommitCard
      notice={primaryCommitNotice}
      hasEditorSession={hasNextEditorSession}
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
        notice={primaryCommitNotice}
        hasEditorSession={hasNextEditorSession}
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
    [primaryCommitNotice, hasNextEditorSession, passwordKey, hasInvalidJsonDraft, isSaving, isCommitDisabled, handleSaveToGitHub, convexSaveButton]
  );

  const _createCommitPanel = (
    <DevCommitCard
      notice={primaryCommitNotice}
      hasEditorSession={hasNextEditorSession}
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
  if (articles.length === 0) {
    return (
      <main id="main-content" tabIndex={-1} className={`${mainClassName} focus:outline-none`}>
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
    <main id="main-content" tabIndex={-1} className={`${mainClassName} focus:outline-none`}>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display mt-4 flex items-center justify-center gap-3 text-[2.25rem] font-bold tracking-tight text-fuchsia-300 sm:text-[2.7rem]">
            <Icon icon="lucide:wrench" size={32} className="text-current" />
            <span>Dev Tools</span>
          </h1>
        </div>

        <div className="mt-10 flex justify-center">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20">
            {/* Auth.js session status */}
            {nextSession.status === "loading" ? (
              <div className="flex items-center justify-center gap-3 py-4">
                <Icon icon="lucide:loader-2" size={20} className="animate-spin text-fuchsia-400" />
                <span className="text-white/70">Loading authentication...</span>
              </div>
            ) : hasNextEditorSession ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
                  <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-200">
                    {nextSession.data?.user?.image && (
                      <AppImage
                        src={nextSession.data.user.image}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5 rounded-full"
                      />
                    )}
                    <Icon icon="lucide:badge-check" size={16} />
                    <span>Signed in as {nextSession.data?.user?.name ?? nextSession.data?.user?.email}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="xs"
                    className="self-start rounded-full"
                    onClick={() => void signOut({ callbackUrl: "/sign-in" })}
                  >
                    <Icon icon="lucide:log-out" size={16} />
                    Sign out
                  </Button>
                </div>
                <p className="text-xs text-white/45">
                  Authenticated via Auth.js. You have permission to edit articles.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-2">
                <p className="text-center text-sm text-white/70">
                  Sign in to access developer tools and edit articles.
                </p>
                <Button
                  variant="default"
                  size="pill"
                  className="rounded-full px-6"
                  onClick={() => {
                    const callbackUrl = typeof window !== "undefined" ? window.location.pathname : "/dev";
                    window.location.href = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
                  }}
                >
                  <Icon icon="lucide:log-in" size={16} />
                  Sign in
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex w-full flex-col items-center gap-4">
          <Tabs
            value={activePrimaryTab}
            onValueChange={(v) => handlePrimaryTabChange(v as DevModePrimaryTab)}
            className="flex justify-center"
          >
            <TabsList className="flex-wrap h-auto bg-white/5 border border-white/10 p-1.5 rounded-2xl gap-1">
              <TabsTrigger
                value="tools"
                className="gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5 text-[0.9375rem] font-medium text-white/60"
              >
                <Icon icon="lucide:wrench" size={18} />
                Tools
              </TabsTrigger>
              <TabsTrigger
                value="change-log"
                className="gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5 text-[0.9375rem] font-medium text-white/60"
              >
                <Icon icon="lucide:scroll-text" size={18} />
                Change log
              </TabsTrigger>
              <TabsTrigger
                value="profile"
                disabled={!hasStoredCredentials}
                className="gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5 disabled:opacity-30 text-[0.9375rem] font-medium text-white/60"
              >
                <Icon icon="lucide:user-round" size={18} />
                Profile
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activePrimaryTab === "tools" && (
            <Tabs
              value={activeTab}
              onValueChange={(v) => handleTabChange(v as DevModeTab)}
              className="flex justify-center"
            >
              <TabsList className="flex-wrap h-auto bg-white/5 border border-white/10 p-1.5 rounded-2xl gap-1">
                <TabsTrigger
                  value="articles"
                  className="gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5 text-[0.9375rem] font-medium text-white/60"
                >
                  <Icon icon="lucide:sparkles" size={18} />
                  Substance Articles
                </TabsTrigger>
                <TabsTrigger
                  value="tag-editor"
                  className="gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5 text-[0.9375rem] font-medium text-white/60"
                >
                  <Icon icon="lucide:tags" size={18} />
                  Tags
                </TabsTrigger>
                <TabsTrigger
                  value="about"
                  className="gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5 text-[0.9375rem] font-medium text-white/60"
                >
                  <Icon icon="lucide:file-text" size={18} />
                  About
                </TabsTrigger>
                <TabsTrigger
                  value="index-layout"
                  className="gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5 text-[0.9375rem] font-medium text-white/60"
                >
                  <Icon icon="lucide:layout-dashboard" size={18} />
                  Index layout
                </TabsTrigger>
              </TabsList>
            </Tabs>
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
