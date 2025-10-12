import { ChevronDown, Copy, Download, RefreshCw, ShieldCheck, Undo2, Wrench } from "lucide-react";
import { dosageCategoryGroups, substanceRecords } from "../../data/library";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { useDevMode } from "../dev/DevModeContext";
import { JsonEditor } from "../common/JsonEditor";
import { SectionCard } from "../common/SectionCard";

type ChangeNotice = {
  type: "success" | "error";
  message: string;
};

type DoseRangeForm = {
  threshold: string;
  light: string;
  common: string;
  strong: string;
  heavy: string;
};

type RouteEntryForm = {
  route: string;
  units: string;
  doseRanges: DoseRangeForm;
};

type CitationEntryForm = {
  name: string;
  reference: string;
};

type DurationForm = {
  totalDuration: string;
  onset: string;
  peak: string;
  offset: string;
  afterEffects: string;
};

type ToleranceForm = {
  fullTolerance: string;
  halfTolerance: string;
  zeroTolerance: string;
};

type NewArticleForm = {
  id: string;
  title: string;
  content: string;
  indexCategory: string;
  drugName: string;
  chemicalName: string;
  alternativeName: string;
  searchUrl: string;
  chemicalClass: string;
  psychoactiveClass: string;
  mechanismOfAction: string;
  addictionPotential: string;
  notes: string;
  halfLife: string;
  categoriesInput: string;
  subjectiveEffectsInput: string;
  crossTolerancesInput: string;
  interactionsDangerousInput: string;
  interactionsUnsafeInput: string;
  interactionsCautionInput: string;
  duration: DurationForm;
  tolerance: ToleranceForm;
  routes: RouteEntryForm[];
  citations: CitationEntryForm[];
};

type NewArticleStringField =
  | "id"
  | "title"
  | "content"
  | "indexCategory"
  | "drugName"
  | "chemicalName"
  | "alternativeName"
  | "searchUrl"
  | "chemicalClass"
  | "psychoactiveClass"
  | "mechanismOfAction"
  | "addictionPotential"
  | "notes"
  | "halfLife"
  | "categoriesInput"
  | "subjectiveEffectsInput"
  | "crossTolerancesInput"
  | "interactionsDangerousInput"
  | "interactionsUnsafeInput"
  | "interactionsCautionInput";

const createEmptyDoseRanges = (): DoseRangeForm => ({
  threshold: "",
  light: "",
  common: "",
  strong: "",
  heavy: "",
});

const createEmptyRouteEntry = (): RouteEntryForm => ({
  route: "",
  units: "",
  doseRanges: createEmptyDoseRanges(),
});

const createEmptyCitationEntry = (): CitationEntryForm => ({
  name: "",
  reference: "",
});

const createInitialNewArticleForm = (): NewArticleForm => ({
  id: "",
  title: "",
  content: "",
  indexCategory: "",
  drugName: "",
  chemicalName: "",
  alternativeName: "",
  searchUrl: "",
  chemicalClass: "",
  psychoactiveClass: "",
  mechanismOfAction: "",
  addictionPotential: "",
  notes: "",
  halfLife: "",
  categoriesInput: "",
  subjectiveEffectsInput: "",
  crossTolerancesInput: "",
  interactionsDangerousInput: "",
  interactionsUnsafeInput: "",
  interactionsCautionInput: "",
  duration: {
    totalDuration: "",
    onset: "",
    peak: "",
    offset: "",
    afterEffects: "",
  },
  tolerance: {
    fullTolerance: "",
    halfTolerance: "",
    zeroTolerance: "",
  },
  routes: [createEmptyRouteEntry()],
  citations: [createEmptyCitationEntry()],
});

const parseListInput = (value: string) =>
  value
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const buildNewArticlePayload = (form: NewArticleForm) => {
  const idValue = Number.parseInt(form.id.trim(), 10);
  const hasValidId = Number.isFinite(idValue);

  const routes = form.routes
    .map((route) => {
      const trimmedDoseRanges = {
        threshold: route.doseRanges.threshold.trim(),
        light: route.doseRanges.light.trim(),
        common: route.doseRanges.common.trim(),
        strong: route.doseRanges.strong.trim(),
        heavy: route.doseRanges.heavy.trim(),
      };

      const hasDoseContent = Object.values(trimmedDoseRanges).some((value) => value.length > 0);

      return {
        route: route.route.trim(),
        units: route.units.trim(),
        dose_ranges: trimmedDoseRanges,
        hasDoseContent,
      };
    })
    .filter((route) => route.route.length > 0 || route.units.length > 0 || route.hasDoseContent)
    .map(({ hasDoseContent: _omit, ...rest }) => rest);

  const citations = form.citations
    .map((entry) => ({ name: entry.name.trim(), reference: entry.reference.trim() }))
    .filter((entry) => entry.name.length > 0 || entry.reference.length > 0);

  const interactions = {
    dangerous: parseListInput(form.interactionsDangerousInput),
    unsafe: parseListInput(form.interactionsUnsafeInput),
    caution: parseListInput(form.interactionsCautionInput),
  };

  const duration = {
    total_duration: form.duration.totalDuration.trim(),
    onset: form.duration.onset.trim(),
    peak: form.duration.peak.trim(),
    offset: form.duration.offset.trim(),
    after_effects: form.duration.afterEffects.trim(),
  };

  const tolerance = {
    full_tolerance: form.tolerance.fullTolerance.trim(),
    half_tolerance: form.tolerance.halfTolerance.trim(),
    zero_tolerance: form.tolerance.zeroTolerance.trim(),
    cross_tolerances: parseListInput(form.crossTolerancesInput),
  };

  const drugInfo = {
    drug_name: form.drugName.trim(),
    chemical_name: form.chemicalName.trim(),
    alternative_name: form.alternativeName.trim(),
    search_url: form.searchUrl.trim(),
    chemical_class: form.chemicalClass.trim(),
    psychoactive_class: form.psychoactiveClass.trim(),
    mechanism_of_action: form.mechanismOfAction.trim(),
    dosages: {
      routes_of_administration: routes,
    },
    duration,
    addiction_potential: form.addictionPotential.trim(),
    interactions,
    notes: form.notes.trim(),
    subjective_effects: parseListInput(form.subjectiveEffectsInput),
    tolerance,
    half_life: form.halfLife.trim(),
    citations,
    categories: parseListInput(form.categoriesInput),
  };

  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    content: form.content.trim(),
    "index-category": form.indexCategory.trim(),
    drug_info: drugInfo,
  };

  if (hasValidId) {
    payload.id = idValue;
  }

  return payload;
};

const baseInputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";
const baseTextareaClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";
const baseSelectClass =
  "w-full appearance-none rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 pr-12 text-sm text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";
const compactSelectClass =
  "w-full appearance-none rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 pr-10 text-xs text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";

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

type DiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const joinPath = (segments: string[]) =>
  segments.reduce((acc, segment) => {
    if (segment.startsWith("[")) {
      return `${acc}${segment}`;
    }
    return acc.length > 0 ? `${acc}.${segment}` : segment;
  }, "");

const valuesEqual = (a: unknown, b: unknown) => {
  if (Object.is(a, b)) {
    return true;
  }
  return false;
};

const collectDiff = (original: unknown, updated: unknown, segments: string[], acc: DiffEntry[]) => {
  if (original === undefined && updated === undefined) {
    return;
  }

  if (Array.isArray(original) && Array.isArray(updated)) {
    const maxLength = Math.max(original.length, updated.length);
    for (let index = 0; index < maxLength; index += 1) {
      collectDiff(
        index < original.length ? original[index] : undefined,
        index < updated.length ? updated[index] : undefined,
        [...segments, `[${index}]`],
        acc,
      );
    }
    return;
  }

  if (isRecord(original) && isRecord(updated)) {
    const keys = new Set([...Object.keys(original), ...Object.keys(updated)]);
    keys.forEach((key) => {
      collectDiff(original[key], updated[key], [...segments, key], acc);
    });
    return;
  }

  if (Array.isArray(original) || Array.isArray(updated) || isRecord(original) || isRecord(updated)) {
    if (!valuesEqual(original, updated)) {
      acc.push({ path: joinPath(segments), before: original, after: updated });
    }
    return;
  }

  if (valuesEqual(original, updated)) {
    return;
  }

  acc.push({ path: joinPath(segments), before: original, after: updated });
};

const formatValue = (value: unknown) => {
  if (value === undefined) {
    return "∅";
  }
  if (typeof value === "string") {
    return value.replace(/`/g, "\`");
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

const formatDiffEntry = ({ path, before, after }: DiffEntry) => {
  const label = path.length > 0 ? path : "record";
  if (before === undefined && after !== undefined) {
    return `- \`${label}\`: added \`${formatValue(after)}\``;
  }
  if (before !== undefined && after === undefined) {
    return `- \`${label}\`: removed (was \`${formatValue(before)}\`)`;
  }
  return `- \`${label}\`: \`${formatValue(before)}\` → \`${formatValue(after)}\``;
};

const generateChangelogMarkdown = (heading: string, original: unknown, updated: unknown) => {
  if (!original && !updated) {
    return `### ${heading}\n\n- No data available for comparison.\n`;
  }

  const entries: DiffEntry[] = [];
  collectDiff(original, updated, [], entries);
  if (entries.length === 0) {
    return `### ${heading}\n\n- No saved differences versus source dataset.\n`;
  }

  return `### ${heading}\n\n${entries.map((entry) => formatDiffEntry(entry)).join("\n")}\n`;
};

export function DevModePage() {
  const {
    articles,
    close,
    updateArticleAt,
    resetArticleAt,
    resetAll,
    getOriginalArticle,
  } = useDevMode();
  const [activeTab, setActiveTab] = useState<"edit" | "create">("edit");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editorValue, setEditorValue] = useState("{}");
  const [notice, setNotice] = useState<ChangeNotice | null>(null);
  const [newArticleForm, setNewArticleForm] = useState<NewArticleForm>(() => createInitialNewArticleForm());
  const [creatorNotice, setCreatorNotice] = useState<ChangeNotice | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [githubNotice, setGithubNotice] = useState<ChangeNotice | null>(null);

  const selectedArticle = useMemo(() => articles[selectedIndex], [articles, selectedIndex]);
  const originalArticle = useMemo(() => getOriginalArticle(selectedIndex), [getOriginalArticle, selectedIndex]);
  const draftState = useMemo(() => {
    try {
      return { value: JSON.parse(editorValue) as unknown, isValid: true };
    } catch {
      return { value: null, isValid: false };
    }
  }, [editorValue]);
  const { value: draftValue, isValid: isDraftValid } = draftState;
  const comparisonTarget = isDraftValid ? draftValue : selectedArticle;
  const articleLabel = useMemo(() => {
    const labelSource = isDraftValid ? draftValue : selectedArticle;
    if (!labelSource || typeof labelSource !== "object") {
      return `Article ${selectedIndex + 1}`;
    }
    return formatArticleLabel(labelSource, selectedIndex);
  }, [draftValue, isDraftValid, selectedArticle, selectedIndex]);
  const changelogMarkdown = useMemo(() => {
    if (!originalArticle) {
      return `### ${articleLabel}\n\n- No source article available for comparison.\n`;
    }
    if (!isDraftValid) {
      return `### ${articleLabel}\n\n- Unable to generate changelog: current editor JSON is invalid.\n`;
    }
    if (comparisonTarget === undefined) {
      return `### ${articleLabel}\n\n- No comparison data available.\n`;
    }
    return generateChangelogMarkdown(articleLabel, originalArticle, comparisonTarget);
  }, [articleLabel, comparisonTarget, isDraftValid, originalArticle]);

  const newArticlePayload = useMemo(() => buildNewArticlePayload(newArticleForm), [newArticleForm]);
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

  const categoryDropdowns = useMemo(() =>
    dosageCategoryGroups
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
      .filter((group) => group.options.length > 0),
  [slugToArticleIndex]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (articles.length === 0) {
        return 0;
      }
      if (current < 0 || current >= articles.length) {
        return 0;
      }
      return current;
    });
  }, [articles.length]);

  useEffect(() => {
    if (!selectedArticle) {
      setEditorValue("{}");
      return;
    }

    setEditorValue(JSON.stringify(selectedArticle, null, 2));
    setNotice(null);
  }, [selectedArticle]);

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
    if (original) {
      setEditorValue(JSON.stringify(original, null, 2));
    }
    setNotice({ type: "success", message: "Article reset to original content." });
  };

  const resetDataset = () => {
    resetAll();
    setSelectedIndex(0);
    const first = getOriginalArticle(0);
    if (first) {
      setEditorValue(JSON.stringify(first, null, 2));
    }
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
    if (!isDraftValid) {
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
      setNotice({ type: "success", message: "Changelog copied to clipboard." });
    } catch {
      setNotice({ type: "error", message: "Clipboard copy failed. Try downloading instead." });
    }
  };

  const downloadChangelog = () => {
    setNotice(null);
    const slug = toFileSlug(articleLabel || "article");
    const fileName = `changelog-${slug || "record"}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
    const blob = new Blob([changelogMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setNotice({ type: "success", message: "Changelog markdown downloaded." });
  };

  const handleSaveToGitHub = useCallback(async () => {
    const trimmedPassword = adminPassword.trim();
    if (!trimmedPassword) {
      setGithubNotice({ type: "error", message: "Enter the admin password before committing." });
      return;
    }

    try {
      setIsSaving(true);
      setGithubNotice({ type: "success", message: "Verifying password…" });

      const authResponse = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: trimmedPassword }),
      });

      if (!authResponse.ok) {
        const payload = await authResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Authentication failed.");
      }

      setGithubNotice({ type: "success", message: "Password verified. Saving to GitHub…" });

      const saveResponse = await fetch("/api/save-articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: trimmedPassword,
          articlesData: articles,
          commitMessage: `Dev editor update - ${new Date().toLocaleString()}`,
        }),
      });

      const result = await saveResponse.json().catch(() => ({}));

      if (!saveResponse.ok) {
        throw new Error(result.details || result.error || "Save failed.");
      }

      setGithubNotice({
        type: "success",
        message: result.commitUrl ? `Saved to GitHub. Commit → ${result.commitUrl}` : "Saved to GitHub.",
      });
      setAdminPassword("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unexpected error.";
      setGithubNotice({ type: "error", message: reason });
    } finally {
      setIsSaving(false);
      window.setTimeout(() => setGithubNotice(null), 10000);
    }
  }, [adminPassword, articles]);

  const handleAdminPasswordKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !isSaving) {
        event.preventDefault();
        void handleSaveToGitHub();
      }
    },
    [handleSaveToGitHub, isSaving],
  );

  const handleTabChange = useCallback(
    (tab: "edit" | "create") => {
      setActiveTab(tab);
      if (tab === "edit") {
        setCreatorNotice(null);
      } else {
        setNotice(null);
      }
      setGithubNotice(null);
    },
    [setCreatorNotice, setGithubNotice, setNotice],
  );

  const handleNewArticleFieldChange = useCallback(
    (field: NewArticleStringField) =>
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        setCreatorNotice(null);
        setNewArticleForm((previous) => ({
          ...previous,
          [field]: value,
        }));
      },
    [],
  );

  const handleDurationFieldChange = useCallback(
    (field: keyof DurationForm) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setCreatorNotice(null);
      setNewArticleForm((previous) => ({
        ...previous,
        duration: {
          ...previous.duration,
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleToleranceFieldChange = useCallback(
    (field: keyof ToleranceForm) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setCreatorNotice(null);
      setNewArticleForm((previous) => ({
        ...previous,
        tolerance: {
          ...previous.tolerance,
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleRouteFieldChange = useCallback(
    (index: number, field: "route" | "units") => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setCreatorNotice(null);
      setNewArticleForm((previous) => ({
        ...previous,
        routes: previous.routes.map((route, routeIndex) =>
          routeIndex === index
            ? {
                ...route,
                [field]: value,
              }
            : route,
        ),
      }));
    },
    [],
  );

  const handleDoseRangeFieldChange = useCallback(
    (index: number, field: keyof DoseRangeForm) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setCreatorNotice(null);
      setNewArticleForm((previous) => ({
        ...previous,
        routes: previous.routes.map((route, routeIndex) =>
          routeIndex === index
            ? {
                ...route,
                doseRanges: {
                  ...route.doseRanges,
                  [field]: value,
                },
              }
            : route,
        ),
      }));
    },
    [],
  );

  const addRouteEntry = useCallback(() => {
    setCreatorNotice(null);
    setNewArticleForm((previous) => ({
      ...previous,
      routes: [...previous.routes, createEmptyRouteEntry()],
    }));
  }, []);

  const removeRouteEntry = useCallback((index: number) => {
    setCreatorNotice(null);
    setNewArticleForm((previous) => {
      if (previous.routes.length <= 1) {
        return {
          ...previous,
          routes: [createEmptyRouteEntry()],
        };
      }

      return {
        ...previous,
        routes: previous.routes.filter((_, routeIndex) => routeIndex !== index),
      };
    });
  }, []);

  const handleCitationFieldChange = useCallback(
    (index: number, field: keyof CitationEntryForm) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setCreatorNotice(null);
      setNewArticleForm((previous) => ({
        ...previous,
        citations: previous.citations.map((citation, citationIndex) =>
          citationIndex === index
            ? {
                ...citation,
                [field]: value,
              }
            : citation,
        ),
      }));
    },
    [],
  );

  const addCitationEntry = useCallback(() => {
    setCreatorNotice(null);
    setNewArticleForm((previous) => ({
      ...previous,
      citations: [...previous.citations, createEmptyCitationEntry()],
    }));
  }, []);

  const removeCitationEntry = useCallback((index: number) => {
    setCreatorNotice(null);
    setNewArticleForm((previous) => {
      if (previous.citations.length <= 1) {
        return {
          ...previous,
          citations: [createEmptyCitationEntry()],
        };
      }

      return {
        ...previous,
        citations: previous.citations.filter((_, citationIndex) => citationIndex !== index),
      };
    });
  }, []);

  const resetNewArticleForm = useCallback(() => {
    setNewArticleForm(createInitialNewArticleForm());
    setCreatorNotice({ type: "success", message: "New article form reset." });
  }, []);

  const copyNewArticleJson = useCallback(async () => {
    if (!isNewArticleValid) {
      setCreatorNotice({ type: "error", message: "Fill the required fields before exporting." });
      return;
    }

    try {
      await navigator.clipboard.writeText(newArticleJson);
      setCreatorNotice({ type: "success", message: "New article JSON copied to clipboard." });
    } catch {
      setCreatorNotice({ type: "error", message: "Clipboard copy failed. Try downloading instead." });
    }
  }, [isNewArticleValid, newArticleJson]);

  const downloadNewArticleJson = useCallback(() => {
    if (!isNewArticleValid) {
      setCreatorNotice({ type: "error", message: "Fill the required fields before exporting." });
      return;
    }

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
  }, [isNewArticleValid, newArticleForm.drugName, newArticleForm.title, newArticleJson]);

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

    setSelectedIndex(nextIndex);
    event.target.value = "";
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 text-white md:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70">
          <Wrench className="h-4 w-4 text-fuchsia-200" />
          Dev Tools
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-fuchsia-200 drop-shadow-[0_1px_0_rgba(255,255,255,0.12)] md:text-5xl">
          Developer Draft Editor
        </h1>
        <p className="mt-6 text-sm text-white/70 md:text-base">
          Work with the same palette and rhythm as individual substance profiles while you review and adjust article
          content. Draft edits live locally until you export them.
        </p>
        <p className="mt-4 text-xs text-white/50">
          Press <span className="font-semibold text-white/80">Esc</span> anytime to return to the main app.
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => handleTabChange("edit")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === "edit" ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:text-white"
            }`}
          >
            Draft editor
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("create")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === "create" ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:text-white"
            }`}
          >
            New article
          </button>
        </div>
      </div>

      {activeTab === "edit" ? (
        <div className="mt-10 grid gap-6 md:grid-cols-[19rem,1fr]">
          <div className="space-y-6">
            <SectionCard className="space-y-6 bg-white/[0.04]">
              <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Dataset</p>
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
                value={selectedIndex}
                onChange={(event) => setSelectedIndex(Number(event.target.value))}
              >
                {articleOptions.map(({ index, label }) => (
                  <option key={index} value={index}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            </div>

            {categoryDropdowns.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">
                  Jump by psychoactive class
                </p>
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Guidance</p>
              <h2 className="text-lg font-semibold text-fuchsia-200">Working tips</h2>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-sm text-white/70">
              <li>Draft updates persist only for this session until you export them.</li>
              <li>Share exported JSON or Markdown alongside your change notes for review.</li>
              <li>Reset controls quickly restore the original dataset if you need a clean slate.</li>
            </ul>
          </SectionCard>

          <SectionCard className="space-y-4 bg-white/[0.04]">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Dataset actions</p>
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
          </SectionCard>

          <SectionCard className="space-y-4 bg-white/[0.04]">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">GitHub</p>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-fuchsia-200" />
                <h2 className="text-lg font-semibold text-fuchsia-200">Commit to GitHub</h2>
              </div>
              <p className="text-sm text-white/65">Authenticate with the shared password to push the current dataset.</p>
            </div>
            <div className="space-y-2">
              <label
                className="text-xs font-medium uppercase tracking-wide text-white/50"
                htmlFor="dev-mode-admin-password"
              >
                Admin password
              </label>
              <input
                id="dev-mode-admin-password"
                type="password"
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white/85 placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/40 disabled:cursor-not-allowed disabled:opacity-60"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                onKeyDown={handleAdminPasswordKeyDown}
                disabled={isSaving}
                placeholder="Enter shared admin password"
              />
            </div>
            <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
              <div className="min-h-[1.25rem]">
                {githubNotice ? (
                  <p className={githubNotice.type === "error" ? "text-rose-300" : "text-emerald-300"}>{githubNotice.message}</p>
                ) : (
                  <p className="text-xs text-white/45">Commits trigger a fresh Vercel deployment.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSaveToGitHub}
                  disabled={isSaving || adminPassword.trim().length === 0}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {isSaving ? "Saving…" : "Commit changes"}
                </button>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard className="space-y-5 bg-white/[0.04]">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Editing</p>
              <h2 className="text-xl font-semibold text-fuchsia-200">JSON workspace</h2>
              <p className="text-sm text-white/65">Modify the active article directly within the structured editor.</p>
            </div>
            <JsonEditor id="dev-mode-editor" className="flex-1" minHeight={360} value={editorValue} onChange={setEditorValue} />
            <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
              <div className="min-h-[1.25rem]">
                {notice && (
                  <p className={notice.type === "error" ? "text-rose-300" : "text-emerald-300"}>{notice.message}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-1.5 text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white"
                  onClick={downloadArticle}
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
                  className="flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                  onClick={applyEdits}
                >
                  Save draft
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard className="space-y-4 bg-white/[0.04]">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Review</p>
              <h2 className="text-xl font-semibold text-fuchsia-200">Changelog preview</h2>
              <p className="text-sm text-white/65">Share a snapshot of your edits alongside the raw dataset.</p>
            </div>
            <textarea
              id="dev-mode-changelog"
              className="min-h-[220px] w-full rounded-xl border border-white/10 bg-slate-950/45 p-4 font-mono text-xs text-white focus:border-fuchsia-400 focus:outline-none focus:ring-1 focus:ring-fuchsia-300"
              value={changelogMarkdown}
              readOnly
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white"
                onClick={copyChangelog}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy changelog
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white"
                onClick={downloadChangelog}
              >
                <Download className="h-3.5 w-3.5" />
                Download .md
              </button>
            </div>
            </SectionCard>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[2fr,1fr]">
          <SectionCard className="space-y-8 bg-white/[0.04]">
            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Identity</p>
                <h2 className="text-lg font-semibold text-fuchsia-200">Core metadata</h2>
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                  htmlFor="new-article-title"
                >
                  Title
                </label>
                <input
                  id="new-article-title"
                  className={baseInputClass}
                  value={newArticleForm.title}
                  onChange={handleNewArticleFieldChange("title")}
                  placeholder="Primary article title"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                    htmlFor="new-article-id"
                  >
                    Article ID
                  </label>
                  <input
                    id="new-article-id"
                    className={baseInputClass}
                    value={newArticleForm.id}
                    onChange={handleNewArticleFieldChange("id")}
                    placeholder="e.g., 101"
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                    htmlFor="new-article-index"
                  >
                    Index category
                  </label>
                  <input
                    id="new-article-index"
                    className={baseInputClass}
                    value={newArticleForm.indexCategory}
                    onChange={handleNewArticleFieldChange("indexCategory")}
                    placeholder="Optional catalog tag"
                  />
                </div>
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                  htmlFor="new-article-content"
                >
                  Overview (optional)
                </label>
                <textarea
                  id="new-article-content"
                  className={`${baseTextareaClass} min-h-[120px]`}
                  value={newArticleForm.content}
                  onChange={handleNewArticleFieldChange("content")}
                  placeholder="Landing copy or summary"
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Naming</p>
                <h2 className="text-lg font-semibold text-fuchsia-200">Drug identity & lookup</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                    htmlFor="new-article-drug-name"
                  >
                    Display name
                  </label>
                  <input
                    id="new-article-drug-name"
                    className={baseInputClass}
                    value={newArticleForm.drugName}
                    onChange={handleNewArticleFieldChange("drugName")}
                    placeholder="e.g., LSD"
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                    htmlFor="new-article-chemical-name"
                  >
                    Chemical name
                  </label>
                  <input
                    id="new-article-chemical-name"
                    className={baseInputClass}
                    value={newArticleForm.chemicalName}
                    onChange={handleNewArticleFieldChange("chemicalName")}
                    placeholder="Systematic or ISO name"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                    htmlFor="new-article-alternative-name"
                  >
                    Alternative name
                  </label>
                  <input
                    id="new-article-alternative-name"
                    className={baseInputClass}
                    value={newArticleForm.alternativeName}
                    onChange={handleNewArticleFieldChange("alternativeName")}
                    placeholder="Common alias (optional)"
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                    htmlFor="new-article-search-url"
                  >
                    Reference URL
                  </label>
                  <input
                    id="new-article-search-url"
                    className={baseInputClass}
                    value={newArticleForm.searchUrl}
                    onChange={handleNewArticleFieldChange("searchUrl")}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Classification</p>
                <h2 className="text-lg font-semibold text-fuchsia-200">Chemical profile</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                    htmlFor="new-article-chemical-class"
                  >
                    Chemical class
                  </label>
                  <input
                    id="new-article-chemical-class"
                    className={baseInputClass}
                    value={newArticleForm.chemicalClass}
                    onChange={handleNewArticleFieldChange("chemicalClass")}
                    placeholder="e.g., Phenethylamines"
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                    htmlFor="new-article-psychoactive-class"
                  >
                    Psychoactive class
                  </label>
                  <input
                    id="new-article-psychoactive-class"
                    className={baseInputClass}
                    value={newArticleForm.psychoactiveClass}
                    onChange={handleNewArticleFieldChange("psychoactiveClass")}
                    placeholder="e.g., Psychedelic, Empathogen"
                  />
                </div>
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                  htmlFor="new-article-mechanism"
                >
                  Mechanism of action
                </label>
                <input
                  id="new-article-mechanism"
                  className={baseInputClass}
                  value={newArticleForm.mechanismOfAction}
                  onChange={handleNewArticleFieldChange("mechanismOfAction")}
                  placeholder="Receptor affinities, transporter activity"
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Dosage</p>
                <h2 className="text-lg font-semibold text-fuchsia-200">Routes of administration</h2>
                <p className="text-xs text-white/50">
                  Provide at least one route with units. Leave ranges blank if data is unavailable.
                </p>
              </div>
              <div className="space-y-4">
                {newArticleForm.routes.map((route, index) => (
                  <div
                    key={`new-route-${index}`}
                    className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white/75">Route {index + 1}</p>
                      {newArticleForm.routes.length > 1 && (
                        <button
                          type="button"
                          className="text-xs text-white/60 transition hover:text-white"
                          onClick={() => removeRouteEntry(index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label
                          className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                          htmlFor={`new-route-name-${index}`}
                        >
                          Route
                        </label>
                        <input
                          id={`new-route-name-${index}`}
                          className={baseInputClass}
                          value={route.route}
                          onChange={handleRouteFieldChange(index, "route")}
                          placeholder="e.g., oral"
                        />
                      </div>
                      <div>
                        <label
                          className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                          htmlFor={`new-route-units-${index}`}
                        >
                          Units
                        </label>
                        <input
                          id={`new-route-units-${index}`}
                          className={baseInputClass}
                          value={route.units}
                          onChange={handleRouteFieldChange(index, "units")}
                          placeholder="e.g., mg"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {([
                        ["threshold", "Threshold"],
                        ["light", "Light"],
                        ["common", "Common"],
                        ["strong", "Strong"],
                        ["heavy", "Heavy"],
                      ] as Array<[keyof DoseRangeForm, string]>).map(([key, label]) => (
                        <div key={key}>
                          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                            {label}
                          </label>
                          <input
                            className={baseInputClass}
                            value={route.doseRanges[key]}
                            onChange={handleDoseRangeFieldChange(index, key)}
                            placeholder="e.g., 5-10 mg"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addRouteEntry}
                className="w-full rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
              >
                Add administration route
              </button>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Duration</p>
                <h2 className="text-lg font-semibold text-fuchsia-200">Timeline & half-life</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {([
                  ["totalDuration", "Total duration"],
                  ["onset", "Onset"],
                  ["peak", "Peak"],
                  ["offset", "Offset"],
                  ["afterEffects", "After effects"],
                ] as Array<[keyof DurationForm, string]>).map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                      {label}
                    </label>
                    <input
                      className={baseInputClass}
                      value={newArticleForm.duration[key]}
                      onChange={handleDurationFieldChange(key)}
                      placeholder="e.g., 6-8 hours"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                  htmlFor="new-article-half-life"
                >
                  Half-life
                </label>
                <input
                  id="new-article-half-life"
                  className={baseInputClass}
                  value={newArticleForm.halfLife}
                  onChange={handleNewArticleFieldChange("halfLife")}
                  placeholder="e.g., 3-6 hours"
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Safety</p>
                <h2 className="text-lg font-semibold text-fuchsia-200">Risk notes & interactions</h2>
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                  htmlFor="new-article-addiction"
                >
                  Addiction potential
                </label>
                <textarea
                  id="new-article-addiction"
                  className={`${baseTextareaClass} min-h-[100px]`}
                  value={newArticleForm.addictionPotential}
                  onChange={handleNewArticleFieldChange("addictionPotential")}
                  placeholder="Summary of dependency risks"
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
                  htmlFor="new-article-notes"
                >
                  Notes
                </label>
                <textarea
                  id="new-article-notes"
                  className={`${baseTextareaClass} min-h-[120px]`}
                  value={newArticleForm.notes}
                  onChange={handleNewArticleFieldChange("notes")}
                  placeholder="Contextual harm reduction advice"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                    Dangerous combinations
                  </label>
                  <textarea
                    className={`${baseTextareaClass} min-h-[80px] py-2`}
                    value={newArticleForm.interactionsDangerousInput}
                    onChange={handleNewArticleFieldChange("interactionsDangerousInput")}
                    placeholder="Alcohol, MAOIs"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                    Unsafe combinations
                  </label>
                  <textarea
                    className={`${baseTextareaClass} min-h-[80px] py-2`}
                    value={newArticleForm.interactionsUnsafeInput}
                    onChange={handleNewArticleFieldChange("interactionsUnsafeInput")}
                    placeholder="Other stimulants"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                    Caution combinations
                  </label>
                  <textarea
                    className={`${baseTextareaClass} min-h-[80px] py-2`}
                    value={newArticleForm.interactionsCautionInput}
                    onChange={handleNewArticleFieldChange("interactionsCautionInput")}
                    placeholder="Benzodiazepines"
                  />
                </div>
              </div>
              <p className="text-[11px] text-white/45">Separate items with commas or new lines.</p>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Experience</p>
                <h2 className="text-lg font-semibold text-fuchsia-200">Effects & tagging</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                    Subjective effects
                  </label>
                  <textarea
                    className={`${baseTextareaClass} min-h-[100px] py-2`}
                    value={newArticleForm.subjectiveEffectsInput}
                    onChange={handleNewArticleFieldChange("subjectiveEffectsInput")}
                    placeholder="Dissociation, Euphoria, ..."
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                    Categories
                  </label>
                  <textarea
                    className={`${baseTextareaClass} min-h-[100px] py-2`}
                    value={newArticleForm.categoriesInput}
                    onChange={handleNewArticleFieldChange("categoriesInput")}
                    placeholder="dissociative, research-chemical"
                  />
                </div>
              </div>
              <p className="text-[11px] text-white/45">Separate items with commas or new lines.</p>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Tolerance</p>
                <h2 className="text-lg font-semibold text-fuchsia-200">Tolerance notes</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {([
                  ["fullTolerance", "Full tolerance"],
                  ["halfTolerance", "Half tolerance"],
                  ["zeroTolerance", "Baseline reset"],
                ] as Array<[keyof ToleranceForm, string]>).map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                      {label}
                    </label>
                    <input
                      className={baseInputClass}
                      value={newArticleForm.tolerance[key]}
                      onChange={handleToleranceFieldChange(key)}
                      placeholder="e.g., ~3 days"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                  Cross tolerances
                </label>
                <textarea
                  className={`${baseTextareaClass} min-h-[80px] py-2`}
                  value={newArticleForm.crossTolerancesInput}
                  onChange={handleNewArticleFieldChange("crossTolerancesInput")}
                  placeholder="Other arylcyclohexylamines"
                />
              </div>
              <p className="text-[11px] text-white/45">Separate items with commas or new lines.</p>
            </section>

            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Citations</p>
                <h2 className="text-lg font-semibold text-fuchsia-200">References</h2>
              </div>
              <div className="space-y-4">
                {newArticleForm.citations.map((citation, index) => (
                  <div
                    key={`new-citation-${index}`}
                    className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white/75">Citation {index + 1}</p>
                      {newArticleForm.citations.length > 1 && (
                        <button
                          type="button"
                          className="text-xs text-white/60 transition hover:text-white"
                          onClick={() => removeCitationEntry(index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                          Source name
                        </label>
                        <input
                          className={baseInputClass}
                          value={citation.name}
                          onChange={handleCitationFieldChange(index, "name")}
                          placeholder="TripSit"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                          Reference URL
                        </label>
                        <input
                          className={baseInputClass}
                          value={citation.reference}
                          onChange={handleCitationFieldChange(index, "reference")}
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addCitationEntry}
                className="w-full rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
              >
                Add citation
              </button>
            </section>
          </SectionCard>

          <SectionCard className="flex flex-col space-y-4 bg-white/[0.04]">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Output</p>
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
            <JsonEditor
              value={newArticleJson}
              minHeight={previewMinHeight}
              readOnly
              className="max-h-[520px] overflow-auto"
            />
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={copyNewArticleJson}
                disabled={!isNewArticleValid}
                className="flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/35 disabled:hover:border-white/5 disabled:hover:text-white/35"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy JSON
              </button>
              <button
                type="button"
                onClick={downloadNewArticleJson}
                disabled={!isNewArticleValid}
                className="flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-1.5 text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white disabled:cursor-not-allowed disabled:border-fuchsia-500/15 disabled:bg-fuchsia-500/5 disabled:text-fuchsia-200/40 disabled:hover:border-fuchsia-500/15 disabled:hover:bg-fuchsia-500/5 disabled:hover:text-fuchsia-200/40"
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
        </div>
      )}
    </main>
  );
}
