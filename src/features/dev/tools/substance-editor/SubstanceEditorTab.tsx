import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { DiffPreview } from "@/components/common/DiffPreview";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  MODEL_OPTIONS,
  resolveOpenRouterModelId,
  validateApiKey,
} from "@/utils/api/openrouter";
import {
  STORAGE_KEYS,
  type SubstanceEditorTabProps,
  type ReviewStatus,
} from "./types";
import { useDevMode } from "../../context/DevModeContext";
import type { SubstanceArticle } from "@/schema";
import { SubstanceEditorOutputSection } from "./SubstanceEditorOutputSection";
import { SubstanceEditorSourcesSection } from "./SubstanceEditorSourcesSection";
import { useSubstanceEditorDraftController } from "./useSubstanceEditorDraftController";
import { useSubstanceEditorSourceData } from "./useSubstanceEditorSourceData";

const REVIEW_STATUS_META: Record<
  ReviewStatus,
  {
    label: string;
    className: string;
  }
> = {
  needed: {
    label: "Review Needed",
    className: "border-rose-400/30 bg-rose-500/10 text-rose-200/90",
  },
  in_progress: {
    label: "In Progress",
    className: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200/90",
  },
  completed: {
    label: "Completed",
    className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200/90",
  },
};

export const SubstanceEditorTab = memo(function SubstanceEditorTab({
  // Prompt-related props are kept for backwards compatibility but no longer used
  // since section-based generation uses individual prompts per section
  generatorPrompt: _generatorPrompt,
  originalGeneratorPrompt: _originalGeneratorPrompt,
  onPromptChange: _onPromptChange,
  onResetPrompt: _onResetPrompt,
  promptDiff,
  promptHasChanges,
  onCopyPrompt: _onCopyPrompt,
  renderCommitPanel,
  commitPanel,
}: SubstanceEditorTabProps) {
  // API state
  // Use sessionStorage for API key (more secure - cleared when browser closes)
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(STORAGE_KEYS.API_KEY)?.trim() || "";
    }
    return "";
  });
  const [apiKeyInput, setApiKeyInput] = useState(apiKey);
  // Use localStorage for model preference (not sensitive)
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== "undefined") {
      return resolveOpenRouterModelId(localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL));
    }
    return DEFAULT_OPENROUTER_MODEL_ID;
  });
  const [isKeyValid, setIsKeyValid] = useState<boolean | null>(null);
  const [isValidatingKey, setIsValidatingKey] = useState(false);

  // DevMode context for saving articles
  const { articles, applyArticlesTransform } = useDevMode();

  const apiKeyValidationRequestIdRef = useRef(0);

  // Persist API key (sessionStorage for security) and model (localStorage for convenience)
  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.API_KEY);
    }
  }, [apiKey]);

  useEffect(() => {
    const normalizedSelectedModel = resolveOpenRouterModelId(selectedModel);

    if (normalizedSelectedModel !== selectedModel) {
      setSelectedModel(normalizedSelectedModel);
      return;
    }

    localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL, normalizedSelectedModel);
  }, [selectedModel]);

  const runApiKeyValidation = useCallback(async (candidateApiKey: string) => {
    const trimmedApiKey = candidateApiKey.trim();
    const requestId = ++apiKeyValidationRequestIdRef.current;

    if (!trimmedApiKey || trimmedApiKey.length < 10) {
      setIsKeyValid(null);
      setIsValidatingKey(false);
      return;
    }

    setIsValidatingKey(true);
    const valid = await validateApiKey(trimmedApiKey);

    if (apiKeyValidationRequestIdRef.current !== requestId) {
      return;
    }

    setIsKeyValid(valid);
    setIsValidatingKey(false);
  }, []);

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    void runApiKeyValidation(apiKey);
  }, [apiKey, runApiKeyValidation]);

  const handleApiKeySubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedApiKey = apiKeyInput.trim();
    setApiKeyInput(trimmedApiKey);

    if (trimmedApiKey === apiKey) {
      void runApiKeyValidation(trimmedApiKey);
    }

    setApiKey(trimmedApiKey);
  }, [apiKey, apiKeyInput, runApiKeyValidation]);

  const selectedModelInfo = useMemo(
    () => MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS.find((m) => m.id === DEFAULT_OPENROUTER_MODEL_ID) ?? MODEL_OPTIONS[0],
    [selectedModel]
  );

  const applyDraftArticlesTransform = useCallback(
    (transform: (previous: SubstanceArticle[]) => SubstanceArticle[]) => {
      applyArticlesTransform((previous) => transform(previous as SubstanceArticle[]));
    },
    [applyArticlesTransform],
  );

  const {
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    showLowPriority,
    setShowLowPriority,
    selectedSubstanceSlug,
    setSelectedSubstanceSlug,
    substances,
    filteredSubstances,
    availableSources,
    totalSubstances,
    substanceModule,
    isLoadingSubstance,
    harmPotentialQuotes,
    pharmacologyQuotes,
    historyCultureQuotes,
    harmPotentialSources,
    pharmacologySources,
    historyCultureSources,
    fullscreenSource,
    fullscreenSourceContent,
    openSourcePreview,
    closeSourcePreview,
    getSourceContent,
    sourcesExpanded,
    setSourcesExpanded,
    substanceEditorContextValue,
  } = useSubstanceEditorSourceData({
    articles,
    apiKey,
    selectedModel,
    isKeyValid,
  });

  const {
    streamedOutput,
    setStreamedOutput,
    outputViewMode,
    formRef,
    formDirty,
    formParseError,
    formArticleOverride,
    isSaving,
    saveSuccess,
    saveError,
    handleOutputViewModeChange,
    handleFormMutate,
    handleCopy,
    handleDownload,
    handleSaveToDatabase,
  } = useSubstanceEditorDraftController({
    articles,
    applyArticlesTransform: applyDraftArticlesTransform,
    selectedSubstanceSlug,
    substances,
    commitPanel,
  });

  const openRouterCredentialInputId = "articles-openrouter-credential";
  const openRouterCredentialHelpId = "articles-openrouter-credential-help";
  const modelSelectId = "articles-model";
  const trimmedApiKeyInput = apiKeyInput.trim();
  const hasPendingApiKeyChange = trimmedApiKeyInput !== apiKey;
  const apiKeySubmitLabel = trimmedApiKeyInput
    ? hasPendingApiKeyChange
      ? apiKey
        ? "Update key"
        : "Save key"
      : "Validate key"
    : apiKey
      ? "Clear key"
      : "Save key";

  return (
    <div className="mt-6 space-y-6">
      {/* API Configuration */}
      <SectionCard delay={0.1}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-fuchsia-200">
          <Icon icon="lucide:bot" className="h-5 w-5 text-fuchsia-300" size={20} />
          API Configuration
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor={openRouterCredentialInputId} className="mb-1.5 block text-sm font-medium text-white/70">
              OpenRouter API Key
            </label>
            <form className="space-y-2" onSubmit={handleApiKeySubmit}>
              <div className="relative">
                <Input
                  id={openRouterCredentialInputId}
                  type="password"
                  value={apiKeyInput}
                  onChange={(event) => {
                    setApiKeyInput(event.target.value);
                    if (event.target.value.trim() !== apiKey) {
                      setIsKeyValid(null);
                    }
                  }}
                  placeholder="sk-or-..."
                  className="pr-10"
                  aria-describedby={openRouterCredentialHelpId}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isValidatingKey ? (
                    <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin text-white/40" size={16} />
                  ) : isKeyValid === true ? (
                    <Icon icon="lucide:check" className="h-4 w-4 text-emerald-400" size={16} />
                  ) : isKeyValid === false ? (
                    <Icon icon="lucide:x" className="h-4 w-4 text-red-400" size={16} />
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p id={openRouterCredentialHelpId} className="text-xs text-white/40">
                  Press Enter or {apiKeySubmitLabel.toLowerCase()} to apply this key for the current session.
                </p>
                <Button
                  type="submit"
                  variant="glass"
                  size="pill"
                  disabled={isValidatingKey || (!trimmedApiKeyInput && !apiKey)}
                >
                  {apiKeySubmitLabel}
                </Button>
              </div>
            </form>
            <p className="mt-1.5 text-xs text-white/40">
              Get an API key from{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fuchsia-300 hover:text-fuchsia-200"
              >
                openrouter.ai
              </a>
            </p>
          </div>
          <div>
            <label htmlFor={modelSelectId} className="mb-1.5 block text-sm font-medium text-white/70">
              Model
            </label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger id={modelSelectId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-xs text-white/50">{m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-white/40">
              Context window: {selectedModelInfo.contextWindow.toLocaleString()} tokens
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Substance Selection */}
      <SectionCard delay={0.15}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-fuchsia-200">
          <Icon icon="lucide:flask-conical" className="h-5 w-5 text-fuchsia-300" size={20} />
          Select Substance
        </h2>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex gap-1">
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("sources-desc")}
              title="Sort by sources (descending)"
              data-active={sortOrder === "sources-desc"}
            >
              <Icon icon="lucide:arrow-up-1-0" className="h-5 w-5" size={20} />
            </Button>
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("sources-asc")}
              title="Sort by sources (ascending)"
              data-active={sortOrder === "sources-asc"}
            >
              <Icon icon="lucide:arrow-down-0-1" className="h-5 w-5" size={20} />
            </Button>
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("alpha-asc")}
              title="Sort alphabetically (A-Z)"
              data-active={sortOrder === "alpha-asc"}
            >
              <Icon icon="lucide:arrow-up-a-z" className="h-5 w-5" size={20} />
            </Button>
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("alpha-desc")}
              title="Sort alphabetically (Z-A)"
              data-active={sortOrder === "alpha-desc"}
            >
              <Icon icon="lucide:arrow-down-z-a" className="h-5 w-5" size={20} />
            </Button>
          </div>
          <Button
            variant={showLowPriority ? "toggleActive" : "toggleInactive"}
            size="pill"
            onClick={() => setShowLowPriority(!showLowPriority)}
            title="Show low-priority substances"
          >
            Low Priority
          </Button>
          <div className="relative flex-1">
            <Icon icon="lucide:search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" size={16} />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search substances..."
              className="pl-10"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40">
          {filteredSubstances.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-white/40">
              No substances found
            </div>
          ) : (
            filteredSubstances.map((substance) => (
              <Button
                key={substance.slug}
                variant="substanceListItem"
                className="justify-between gap-3"
                onClick={() => setSelectedSubstanceSlug(substance.slug)}
                data-active={selectedSubstanceSlug === substance.slug}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-medium">{substance.name}</span>
                  <span className="shrink-0 text-xs text-white/40">
                    ({substance.sources.length} sources)
                  </span>
                </div>
                <Badge
                  variant="secondary"
                  className={REVIEW_STATUS_META[substance.reviewStatus].className}
                >
                  {REVIEW_STATUS_META[substance.reviewStatus].label}
                </Badge>
              </Button>
            ))
          )}
        </div>
        <p className="mt-2 text-xs text-white/40">
          {totalSubstances} substances available
        </p>
      </SectionCard>

      <SubstanceEditorOutputSection
        streamedOutput={streamedOutput}
        outputViewMode={outputViewMode}
        formDirty={formDirty}
        formParseError={formParseError}
        formArticleOverride={formArticleOverride}
        selectedSubstanceSlug={selectedSubstanceSlug}
        onOutputViewModeChange={handleOutputViewModeChange}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onOutputChange={setStreamedOutput}
        onFormMutate={handleFormMutate}
        saveError={saveError}
        formRef={formRef}
        substanceEditorContextValue={substanceEditorContextValue}
      />

      <SubstanceEditorSourcesSection
        substanceModule={substanceModule}
        availableSources={availableSources}
        sourcesExpanded={sourcesExpanded}
        isLoadingSubstance={isLoadingSubstance}
        harmPotentialQuotes={harmPotentialQuotes}
        pharmacologyQuotes={pharmacologyQuotes}
        historyCultureQuotes={historyCultureQuotes}
        onToggleExpanded={() => setSourcesExpanded(!sourcesExpanded)}
        onOpenSourcePreview={openSourcePreview}
        fullscreenSource={fullscreenSource}
        fullscreenSourceContent={fullscreenSourceContent}
        onCloseSourcePreview={closeSourcePreview}
        getSourceContent={getSourceContent}
        harmPotentialSources={harmPotentialSources}
        pharmacologySources={pharmacologySources}
        historyCultureSources={historyCultureSources}
      />

      {/* Prompt Diff */}
      {promptHasChanges && (
        <SectionCard delay={0.4}>
          <h3 className="mb-3 text-sm font-medium text-white/70">Prompt Changes</h3>
          <DiffPreview diffText={promptDiff} />
        </SectionCard>
      )}

      {/* GitHub Commit Panel */}
      {renderCommitPanel ? (
        <div>
          {renderCommitPanel(
            streamedOutput ? (
              <Button
                variant="glass"
                size="pill"
                className="rounded-full"
                onClick={() => handleSaveToDatabase("draft")}
                disabled={isSaving || !streamedOutput}
              >
                {isSaving ? (
                  <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin" size={16} />
                ) : saveSuccess ? (
                  <Icon icon="lucide:check-circle" className="h-4 w-4 text-emerald-400" size={16} />
                ) : (
                  <Icon icon="lucide:save" className="h-4 w-4" size={16} />
                )}
                {saveSuccess ? "Saved!" : "Save Draft"}
              </Button>
            ) : undefined
          )}
        </div>
      ) : commitPanel ? (
        <div>{commitPanel}</div>
      ) : null}
    </div>
  );
});
