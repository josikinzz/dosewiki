import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  MODEL_OPTIONS,
  resolveOpenRouterModelId,
  validateApiKey,
} from "@/utils/api/openrouter";
import {
  STORAGE_KEYS,
  type SubstanceEditorTabProps,
} from "./types";
import { useDevMode } from "../../context/DevModeContext";
import type { SubstanceArticle } from "@/schema";
import { SubstanceEditorOutputSection } from "./SubstanceEditorOutputSection";
import { SubstanceEditorSourcesSection } from "./SubstanceEditorSourcesSection";
import { SubstanceEditorApiSection } from "./SubstanceEditorApiSection";
import { SubstanceEditorSelectionSection } from "./SubstanceEditorSelectionSection";
import { useSubstanceEditorDraftController } from "./useSubstanceEditorDraftController";
import { useSubstanceEditorSourceData } from "./useSubstanceEditorSourceData";

export const SubstanceEditorTab = memo(function SubstanceEditorTab({
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
      <SubstanceEditorApiSection
        apiKey={apiKey}
        apiKeyInput={apiKeyInput}
        apiKeySubmitLabel={apiKeySubmitLabel}
        isKeyValid={isKeyValid}
        isValidatingKey={isValidatingKey}
        modelSelectId={modelSelectId}
        onApiKeyInputChange={(value) => {
          setApiKeyInput(value);
          if (value.trim() !== apiKey) {
            setIsKeyValid(null);
          }
        }}
        onApiKeySubmit={handleApiKeySubmit}
        onSelectedModelChange={setSelectedModel}
        openRouterCredentialHelpId={openRouterCredentialHelpId}
        openRouterCredentialInputId={openRouterCredentialInputId}
        selectedModel={selectedModel}
        selectedModelContextWindow={selectedModelInfo.contextWindow}
      />

      <SubstanceEditorSelectionSection
        filteredSubstances={filteredSubstances}
        onSearchQueryChange={setSearchQuery}
        onSelectSubstance={setSelectedSubstanceSlug}
        onShowLowPriorityChange={setShowLowPriority}
        onSortOrderChange={setSortOrder}
        searchQuery={searchQuery}
        selectedSubstanceSlug={selectedSubstanceSlug}
        showLowPriority={showLowPriority}
        sortOrder={sortOrder}
        totalSubstances={totalSubstances}
      />

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

      {/* Commit Panel */}
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
