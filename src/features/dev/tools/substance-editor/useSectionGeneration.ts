import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import yaml from "yaml";
import {
  estimateTokens,
  streamCompletion,
  type ReasoningEffortLevel,
  type StreamCompletionOptions,
} from "@/utils/api/openrouter";
import type { SectionKey } from "@/data/config/sectionPrompts";

export type ReasoningMode = "off" | "adaptive" | "force";
export type GenerationMode = "fresh_slate" | "review";

const ADAPTIVE_REASONING_LOW_INPUT_TOKENS = 12000;
const ADAPTIVE_REASONING_MINIMAL_INPUT_TOKENS = 18000;
const ADAPTIVE_REASONING_DISABLE_INPUT_TOKENS = 30000;
const ADAPTIVE_REASONING_LOW_SOURCE_CHARS = 50000;
const ADAPTIVE_REASONING_MINIMAL_SOURCE_CHARS = 80000;
const ADAPTIVE_REASONING_DISABLE_SOURCE_CHARS = 120000;

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

interface GenericSource {
  source: string;
  content: string;
}

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

function safeEstimateTokens(text: string | null | undefined): number | null {
  if (!text) {
    return 0;
  }

  try {
    return estimateTokens(text);
  } catch {
    return null;
  }
}

function previewLogText(text: string, maxLength: number = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function hasNonEmptyValues(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).some((entry) => (
    entry !== null
    && entry !== undefined
    && entry !== ""
    && !(Array.isArray(entry) && entry.length === 0)
    && !(typeof entry === "object" && !hasNonEmptyValues(entry))
  ));
}

function hasSectionContent(currentArticleYaml: string | null, sectionKey: SectionKey): boolean {
  if (!currentArticleYaml) {
    return false;
  }

  try {
    const parsed = yaml.parse(currentArticleYaml);

    if (sectionKey === "dosage_duration") {
      return hasNonEmptyValues(parsed.dosage) || hasNonEmptyValues(parsed.duration);
    }

    return hasNonEmptyValues(parsed[sectionKey]);
  } catch {
    return false;
  }
}

function getFilteredArticleYaml(fullYaml: string, sectionKey: SectionKey): string {
  try {
    const parsed = yaml.parse(fullYaml);

    if (sectionKey === "dosage_duration") {
      delete parsed.dosage;
      delete parsed.duration;
    } else {
      delete parsed[sectionKey];
    }

    return yaml.stringify(parsed, { lineWidth: 0, nullStr: "" });
  } catch {
    return fullYaml;
  }
}

function buildUserMessage({
  currentArticleYaml,
  extractedContent,
  genericSources,
  generationMode,
  sectionKey,
  sectionLabel,
}: {
  currentArticleYaml: string | null;
  extractedContent: string | null;
  genericSources: GenericSource[];
  generationMode: GenerationMode;
  sectionKey: SectionKey;
  sectionLabel: string;
}) {
  const messageParts: string[] = [];

  if (currentArticleYaml) {
    if (generationMode === "fresh_slate") {
      const filteredYaml = getFilteredArticleYaml(currentArticleYaml, sectionKey);
      messageParts.push(
        `## Current Article Context\n\nBelow is the current state of OTHER sections in the article (the ${sectionLabel} section is excluded). Use this to understand what exists elsewhere and avoid duplication. Generate the ${sectionLabel} section from scratch based on the provided sources.\n\n\`\`\`yaml\n${filteredYaml}\n\`\`\``,
      );
    } else {
      messageParts.push(
        `## Current Article State (Review Mode)\n\nBelow is the current article including the existing ${sectionLabel} section. Review the existing ${sectionLabel} content and improve it where applicable:\n- Enhance clarity and readability\n- Add any missing information from sources\n- Correct any inaccuracies\n- Preserve accurate content that doesn't need changes\n\n\`\`\`yaml\n${currentArticleYaml}\n\`\`\``,
      );
    }
  }

  if (extractedContent) {
    messageParts.push(`## Extracted Source Content for ${sectionLabel}\n\n${extractedContent}`);
  } else if (genericSources.length > 0) {
    const sourcesText = genericSources
      .map(({ source, content }) => `## Source: ${source}\n\n${content}`)
      .join("\n\n---\n\n");
    messageParts.push(sourcesText);
  }

  return messageParts.join("\n\n---\n\n");
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
    () => buildUserMessage({
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
    if (!supportsReasoning) {
      return {
        enableReasoning: false,
        reasoningEffort: null,
        mode: "unsupported",
        reason: "Current model does not support reasoning.",
      } as const;
    }

    if (reasoningMode === "off") {
      return {
        enableReasoning: false,
        reasoningEffort: null,
        mode: "off",
        reason: "Reasoning is disabled for this run.",
      } as const;
    }

    if (reasoningMode === "force") {
      return {
        enableReasoning: true,
        reasoningEffort,
        mode: "force",
        reason: `Force mode keeps ${reasoningEffort} reasoning for this run.`,
      } as const;
    }

    const extractedContentChars = extractedContent?.length ?? 0;
    const shouldDisableReasoning =
      (totalInputTokenEstimate != null && totalInputTokenEstimate >= ADAPTIVE_REASONING_DISABLE_INPUT_TOKENS)
      || extractedContentChars >= ADAPTIVE_REASONING_DISABLE_SOURCE_CHARS
      || genericSourceChars >= ADAPTIVE_REASONING_DISABLE_SOURCE_CHARS;

    if (shouldDisableReasoning) {
      return {
        enableReasoning: false,
        reasoningEffort: null,
        mode: "adaptive-disabled",
        reason: "Adaptive mode disables reasoning only for very large prompts.",
      } as const;
    }

    const shouldUseMinimalReasoning =
      (totalInputTokenEstimate != null && totalInputTokenEstimate >= ADAPTIVE_REASONING_MINIMAL_INPUT_TOKENS)
      || extractedContentChars >= ADAPTIVE_REASONING_MINIMAL_SOURCE_CHARS
      || genericSourceChars >= ADAPTIVE_REASONING_MINIMAL_SOURCE_CHARS;

    if (shouldUseMinimalReasoning) {
      return {
        enableReasoning: true,
        reasoningEffort: "minimal",
        mode: "adaptive-minimal",
        reason: "Adaptive mode downgraded reasoning to minimal for this larger prompt.",
      } as const;
    }

    const shouldUseLowReasoning =
      (totalInputTokenEstimate != null && totalInputTokenEstimate >= ADAPTIVE_REASONING_LOW_INPUT_TOKENS)
      || extractedContentChars >= ADAPTIVE_REASONING_LOW_SOURCE_CHARS
      || genericSourceChars >= ADAPTIVE_REASONING_LOW_SOURCE_CHARS;

    if (shouldUseLowReasoning) {
      return {
        enableReasoning: true,
        reasoningEffort: "low",
        mode: "adaptive-low",
        reason: "Adaptive mode downgraded reasoning to low for this medium-size prompt.",
      } as const;
    }

    return {
      enableReasoning: true,
      reasoningEffort,
      mode: "adaptive-selected",
      reason: `Adaptive mode kept your selected ${reasoningEffort} effort.`,
    } as const;
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
