import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ReasoningEffortLevel } from "@/utils/api/openrouter";
import type { SectionKey } from "@/data/config/sectionPrompts";
import { assertEditorialReviewMutationAllowed } from "@/schema";
import {
  buildSectionGenerationUserMessage,
  hasSectionContent,
  previewLogText,
  resolveEffectiveReasoningConfig,
  safeEstimateTokens,
  type GenericSource,
} from "./sectionGenerationUtils";
import { runSectionGeneration } from "./sectionGenerationRunner";
import type { GenerationMode, ReasoningMode } from "./types";
import { parseSectionYamlObject } from "./yamlParser";

export const REASONING_MODE_OPTIONS: { value: ReasoningMode; label: string }[] = [
  { value: "force", label: "Force" },
  { value: "adaptive", label: "Adaptive" },
  { value: "off", label: "Off" },
];

export const REASONING_OPTIONS: { value: ReasoningEffortLevel; label: string; description: string }[] = [
  { value: "minimal", label: "Minimal", description: "5% tokens" },
  { value: "low", label: "Low", description: "20% tokens" },
  { value: "medium", label: "Medium", description: "50% tokens" },
  { value: "high", label: "High", description: "80% tokens" },
  { value: "xhigh", label: "Maximum", description: "95% tokens" },
];

interface UseSectionGenerationArgs {
  apiKey: string;
  currentArticleYaml: string | null;
  extractedContent: string | null;
  genericSources: GenericSource[];
  isKeyValid: boolean | null;
  model: string;
  onApply: (sectionYaml: string) => void;
  prompt: string;
  sectionKey: SectionKey;
  sectionLabel: string;
}

export function useSectionGeneration({
  apiKey,
  currentArticleYaml,
  extractedContent,
  genericSources,
  isKeyValid,
  model,
  onApply,
  prompt,
  sectionKey,
  sectionLabel,
}: UseSectionGenerationArgs) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedOutput, setStreamedOutput] = useState("");
  const [streamedReasoning, setStreamedReasoning] = useState("");
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(true);
  const [reasoningMode, setReasoningMode] = useState<ReasoningMode>("force");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffortLevel>("medium");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("fresh_slate");
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationRunCounterRef = useRef(0);
  const activeGenerationRunIdRef = useRef<string | null>(null);

  const supportsReasoning = model.includes("claude");
  const sectionHasContent = useMemo(
    () => hasSectionContent(currentArticleYaml, sectionKey),
    [currentArticleYaml, sectionKey],
  );

  const hasContent = Boolean(extractedContent) || genericSources.length > 0;
  const canGenerate = Boolean(apiKey) && isKeyValid === true && hasContent;
  const showOutput = hasGenerated || isGenerating;

  const userMessage = useMemo(
    () => buildSectionGenerationUserMessage({
      currentArticleYaml,
      extractedContent,
      genericSources,
      generationMode,
      sectionKey,
      sectionLabel,
    }),
    [currentArticleYaml, extractedContent, genericSources, generationMode, sectionKey, sectionLabel],
  );

  const promptTokenEstimate = useMemo(() => safeEstimateTokens(prompt), [prompt]);
  const userMessageTokenEstimate = useMemo(() => safeEstimateTokens(userMessage), [userMessage]);
  const totalInputTokenEstimate = useMemo(() => {
    if (promptTokenEstimate == null || userMessageTokenEstimate == null) {
      return null;
    }

    return promptTokenEstimate + userMessageTokenEstimate;
  }, [promptTokenEstimate, userMessageTokenEstimate]);

  const genericSourceChars = useMemo(
    () => genericSources.reduce((total, source) => total + source.content.length, 0),
    [genericSources],
  );

  const effectiveReasoningConfig = useMemo(() => {
    return resolveEffectiveReasoningConfig({
      supportsReasoning,
      reasoningMode,
      reasoningEffort,
      extractedContent,
      genericSourceChars,
      totalInputTokenEstimate,
    });
  }, [
    extractedContent,
    genericSourceChars,
    reasoningEffort,
    reasoningMode,
    supportsReasoning,
    totalInputTokenEstimate,
  ]);

  const clearGeneratedState = useCallback(() => {
    setStreamedOutput("");
    setStreamedReasoning("");
    setHasGenerated(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (isGenerating) {
      return;
    }

    abortControllerRef.current = null;
  }, [isGenerating]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) {
      return;
    }

    const runId = `${sectionKey}-${Date.now().toString(36)}-${++generationRunCounterRef.current}`;
    activeGenerationRunIdRef.current = runId;

    setIsGenerating(true);
    setStreamedOutput("");
    setStreamedReasoning("");
    setError(null);
    setHasGenerated(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await runSectionGeneration({
        apiKey,
        currentArticleYaml,
        effectiveReasoningConfig,
        extractedContent,
        generationMode,
        genericSourceChars,
        genericSources,
        model,
        onError: setError,
        onOutputChunk: (chunk) => setStreamedOutput((previous) => previous + chunk),
        onReasoningChunk: (chunk) => setStreamedReasoning((previous) => previous + chunk),
        prompt,
        promptTokenEstimate,
        reasoningEffort,
        reasoningMode,
        runId,
        sectionKey,
        sectionLabel,
        signal: controller.signal,
        supportsReasoning,
        totalInputTokenEstimate,
        userMessage,
        userMessageTokenEstimate,
      });
    } finally {
      setIsGenerating(false);
      activeGenerationRunIdRef.current = null;
    }
  }, [
    apiKey,
    canGenerate,
    currentArticleYaml,
    effectiveReasoningConfig,
    extractedContent,
    generationMode,
    genericSourceChars,
    genericSources,
    model,
    prompt,
    promptTokenEstimate,
    reasoningEffort,
    reasoningMode,
    sectionKey,
    sectionLabel,
    supportsReasoning,
    totalInputTokenEstimate,
    userMessage,
    userMessageTokenEstimate,
  ]);

  const handleCancel = useCallback(() => {
    if (activeGenerationRunIdRef.current) {
      console.warn(`[SectionGenerator:${sectionKey}] generation-cancelled`, {
        runId: activeGenerationRunIdRef.current,
        sectionKey,
        sectionLabel,
      });
    }

    abortControllerRef.current?.abort();
    setIsGenerating(false);
  }, [sectionKey, sectionLabel]);

  const handleApply = useCallback(() => {
    const trimmedOutput = streamedOutput.trim();

    if (!trimmedOutput) {
      console.warn(`[SectionGenerator:${sectionKey}] apply-skipped-empty-output`, {
        sectionKey,
        sectionLabel,
      });
      setError("There is no generated YAML to apply yet.");
      return;
    }

    try {
      const generatedFields = Object.keys(parseSectionYamlObject(trimmedOutput));
      assertEditorialReviewMutationAllowed("generated_update", [sectionKey, ...generatedFields]);
      console.info(`[SectionGenerator:${sectionKey}] apply-started`, {
        sectionKey,
        sectionLabel,
        outputChars: trimmedOutput.length,
        outputPreview: previewLogText(trimmedOutput),
      });
      onApply(trimmedOutput);
      clearGeneratedState();
      console.info(`[SectionGenerator:${sectionKey}] apply-succeeded`, {
        sectionKey,
        sectionLabel,
        outputChars: trimmedOutput.length,
      });
    } catch (applyError) {
      const message = applyError instanceof Error ? applyError.message : "Failed to apply generated YAML.";
      console.error(`[SectionGenerator:${sectionKey}] apply-failed`, {
        sectionKey,
        sectionLabel,
        outputChars: trimmedOutput.length,
        outputPreview: previewLogText(trimmedOutput),
        error: message,
      });
      setError(message);
    }
  }, [clearGeneratedState, onApply, sectionKey, sectionLabel, streamedOutput]);

  const handleDiscard = useCallback(() => {
    clearGeneratedState();
    setGenerationMode("fresh_slate");
  }, [clearGeneratedState]);

  const toggleReasoningExpanded = useCallback(() => {
    setIsReasoningExpanded((previous) => !previous);
  }, []);

  const toggleGenerationMode = useCallback(() => {
    setGenerationMode((currentMode) => (currentMode === "fresh_slate" ? "review" : "fresh_slate"));
  }, []);

  return {
    canGenerate,
    effectiveReasoningConfig,
    error,
    generationMode,
    handleApply,
    handleCancel,
    handleDiscard,
    handleGenerate,
    hasContent,
    hasGenerated,
    isGenerating,
    isReasoningExpanded,
    reasoningEffort,
    reasoningMode,
    sectionHasContent,
    setReasoningEffort,
    setReasoningMode,
    setStreamedOutput,
    showOutput,
    streamedOutput,
    streamedReasoning,
    supportsReasoning,
    toggleGenerationMode,
    toggleReasoningExpanded,
    userMessage,
  };
}
