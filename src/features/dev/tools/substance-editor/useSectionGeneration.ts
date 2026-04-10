import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  streamCompletion,
  type ReasoningEffortLevel,
  type StreamCompletionOptions,
} from "@/utils/api/openrouter";
import type { SectionKey } from "@/data/config/sectionPrompts";
import {
  buildSectionGenerationUserMessage,
  hasSectionContent,
  previewLogText,
  resolveEffectiveReasoningConfig,
  safeEstimateTokens,
  type GenericSource,
} from "./sectionGenerationUtils";

export type ReasoningMode = "off" | "adaptive" | "force";
export type GenerationMode = "fresh_slate" | "review";

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

    const log = (level: "info" | "warn" | "error", event: string, details?: Record<string, unknown>) => {
      const payload = {
        runId,
        sectionKey,
        sectionLabel,
        model,
        generationMode,
        reasoningMode,
        reasoningEffort,
        supportsReasoning,
        ...details,
      };

      if (level === "warn") {
        console.warn(`[SectionGenerator:${sectionKey}] ${event}`, payload);
        return;
      }

      if (level === "error") {
        console.error(`[SectionGenerator:${sectionKey}] ${event}`, payload);
        return;
      }

      console.info(`[SectionGenerator:${sectionKey}] ${event}`, payload);
    };

    setIsGenerating(true);
    setStreamedOutput("");
    setStreamedReasoning("");
    setError(null);
    setHasGenerated(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    log("info", "generation-started", {
      promptChars: prompt.length,
      promptTokens: promptTokenEstimate,
      userMessageChars: userMessage.length,
      userMessageTokens: userMessageTokenEstimate,
      totalInputTokens: totalInputTokenEstimate,
      currentArticleChars: currentArticleYaml?.length ?? 0,
      currentArticleTokens: safeEstimateTokens(currentArticleYaml),
      extractedContentChars: extractedContent?.length ?? 0,
      extractedContentTokens: safeEstimateTokens(extractedContent),
      genericSourcesCount: genericSources.length,
      genericSourceChars,
      selectedReasoningMode: reasoningMode,
      selectedReasoningEffort: reasoningEffort,
      effectiveReasoningEnabled: effectiveReasoningConfig.enableReasoning,
      effectiveReasoningEffort: effectiveReasoningConfig.reasoningEffort,
      effectiveReasoningMode: effectiveReasoningConfig.mode,
      effectiveReasoningReason: effectiveReasoningConfig.reason,
    });

    const runPass = async (passName: "primary" | "fallback", options: StreamCompletionOptions) => {
      let receivedOutput = false;
      let hadError = false;
      let outputChunkCount = 0;
      let reasoningChunkCount = 0;

      log("info", `${passName}-pass-started`, {
        enableReasoning: options.enableReasoning ?? false,
        reasoningEffort: options.reasoningEffort ?? null,
      });

      const result = await streamCompletion(
        apiKey,
        model,
        prompt,
        userMessage,
        {
          onChunk: (chunk) => {
            receivedOutput = true;
            outputChunkCount += 1;

            if (outputChunkCount === 1) {
              log("info", `${passName}-pass-first-output-chunk`, {
                chunkLength: chunk.length,
                preview: previewLogText(chunk),
              });
            }

            setStreamedOutput((previous) => previous + chunk);
          },
          onReasoning: (chunk) => {
            reasoningChunkCount += 1;

            if (reasoningChunkCount === 1) {
              log("info", `${passName}-pass-first-reasoning-chunk`, {
                chunkLength: chunk.length,
                preview: previewLogText(chunk),
              });
            }

            setStreamedReasoning((previous) => previous + chunk);
          },
          onComplete: (fullText) => {
            log("info", `${passName}-pass-complete-callback`, {
              callbackOutputChars: fullText.length,
            });
          },
          onError: (streamError) => {
            hadError = true;
            setError(streamError.message);
            log("error", `${passName}-pass-error`, {
              error: streamError.message,
            });
          },
        },
        controller.signal,
        options,
      );

      log(receivedOutput ? "info" : "warn", `${passName}-pass-finished`, {
        receivedOutput,
        hadError,
        ...result,
      });

      return {
        ...result,
        hadError,
        receivedOutput,
      };
    };

    try {
      const primaryPassOptions: StreamCompletionOptions = {
        enableReasoning: effectiveReasoningConfig.enableReasoning,
        ...(effectiveReasoningConfig.reasoningEffort
          ? { reasoningEffort: effectiveReasoningConfig.reasoningEffort }
          : {}),
      };

      const primaryPass = await runPass("primary", primaryPassOptions);

      const shouldRetryWithoutReasoning =
        primaryPassOptions.enableReasoning === true
        && !controller.signal.aborted
        && !primaryPass.hadError
        && !primaryPass.receivedOutput;

      if (shouldRetryWithoutReasoning) {
        const retryMessage = primaryPass.finishReason === "length"
          ? "Reasoning used the response budget before YAML was emitted. Retrying without reasoning..."
          : "Reasoning completed without YAML output. Retrying without reasoning...";

        setError(retryMessage);
        setStreamedReasoning((previous) => (
          previous
            ? `${previous}\n\n[No YAML was returned from the reasoning pass. Retrying without reasoning.]`
            : "[No YAML was returned from the reasoning pass. Retrying without reasoning.]"
        ));
        log("warn", "retrying-without-reasoning", {
          primaryFinishReason: primaryPass.finishReason,
          primaryDurationMs: primaryPass.durationMs,
          primaryContentChars: primaryPass.contentChars,
          primaryReasoningChars: primaryPass.reasoningChars,
        });

        const fallbackPass = await runPass("fallback", { enableReasoning: false });

        if (!fallbackPass.hadError && fallbackPass.receivedOutput) {
          setError(null);
          log("info", "generation-finished-with-fallback-output", {
            fallbackFinishReason: fallbackPass.finishReason,
            fallbackDurationMs: fallbackPass.durationMs,
            fallbackContentChars: fallbackPass.contentChars,
          });
        } else if (!fallbackPass.hadError && !fallbackPass.receivedOutput) {
          const failureMessage = fallbackPass.finishReason === "length"
            ? "Generation hit the output budget before any YAML was returned. This is usually token exhaustion rather than a timeout. Try a smaller source set or a larger-context model like Gemini 3 Pro."
            : "Generation completed but returned no YAML at all. This is usually an upstream model/output-budget issue rather than a timeout. Try Gemini 3 Pro/Flash or reduce the source/context size.";

          setError(failureMessage);
          log("warn", "generation-finished-without-yaml-after-fallback", {
            fallbackFinishReason: fallbackPass.finishReason,
            fallbackDurationMs: fallbackPass.durationMs,
            fallbackContentChars: fallbackPass.contentChars,
            fallbackReasoningChars: fallbackPass.reasoningChars,
            failureMessage,
          });
        }

        return;
      }

      if (!primaryPass.hadError && !primaryPass.receivedOutput) {
        const failureMessage = primaryPass.finishReason === "length"
          ? "Generation hit the output budget before any YAML was returned. This is usually token exhaustion rather than a timeout."
          : "Generation completed without any YAML output.";

        setError(failureMessage);
        log("warn", "generation-finished-without-yaml", {
          primaryFinishReason: primaryPass.finishReason,
          primaryDurationMs: primaryPass.durationMs,
          primaryContentChars: primaryPass.contentChars,
          primaryReasoningChars: primaryPass.reasoningChars,
          failureMessage,
        });
        return;
      }

      log("info", "generation-finished-with-output", {
        usedFallback: false,
        primaryFinishReason: primaryPass.finishReason,
        primaryDurationMs: primaryPass.durationMs,
        primaryContentChars: primaryPass.contentChars,
        primaryReasoningChars: primaryPass.reasoningChars,
      });
    } catch (generationError) {
      if (generationError instanceof Error) {
        setError(generationError.message);
        log("error", "generation-threw", {
          error: generationError.message,
        });
      }
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
