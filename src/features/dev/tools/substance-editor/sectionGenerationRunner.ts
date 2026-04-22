import {
  streamCompletion,
  type ReasoningEffortLevel,
  type StreamCompletionOptions,
} from "@/utils/api/openrouter";
import type { SectionKey } from "@/data/config/sectionPrompts";
import { previewLogText, safeEstimateTokens, type GenericSource } from "./sectionGenerationUtils";
import type { GenerationMode, ReasoningMode } from "./types";

type EffectiveReasoningConfig = {
  enableReasoning: boolean;
  reasoningEffort: ReasoningEffortLevel | null;
  mode: string;
  reason: string;
};

type RunSectionGenerationArgs = {
  apiKey: string;
  currentArticleYaml: string | null;
  effectiveReasoningConfig: EffectiveReasoningConfig;
  extractedContent: string | null;
  generationMode: GenerationMode;
  genericSourceChars: number;
  genericSources: GenericSource[];
  model: string;
  onError: (message: string | null) => void;
  onOutputChunk: (chunk: string) => void;
  onReasoningChunk: (chunk: string) => void;
  prompt: string;
  promptTokenEstimate: number | null;
  reasoningEffort: ReasoningEffortLevel;
  reasoningMode: ReasoningMode;
  runId: string;
  sectionKey: SectionKey;
  sectionLabel: string;
  signal: AbortSignal;
  supportsReasoning: boolean;
  totalInputTokenEstimate: number | null;
  userMessage: string;
  userMessageTokenEstimate: number | null;
};

type PassResult = {
  aborted: boolean;
  contentChars: number;
  durationMs: number;
  finishReason: string | null | undefined;
  hadError: boolean;
  reasoningChars: number;
  receivedOutput: boolean;
};

function createGenerationLogger({
  generationMode,
  model,
  reasoningEffort,
  reasoningMode,
  runId,
  sectionKey,
  sectionLabel,
  supportsReasoning,
}: Pick<
  RunSectionGenerationArgs,
  "generationMode" | "model" | "reasoningEffort" | "reasoningMode" | "runId" | "sectionKey" | "sectionLabel" | "supportsReasoning"
>) {
  return (
    level: "info" | "warn" | "error",
    event: string,
    details?: Record<string, unknown>,
  ) => {
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
}

async function runGenerationPass({
  apiKey,
  log,
  model,
  onError,
  onOutputChunk,
  onReasoningChunk,
  options,
  passName,
  prompt,
  signal,
  userMessage,
}: {
  apiKey: string;
  log: ReturnType<typeof createGenerationLogger>;
  model: string;
  onError: (message: string | null) => void;
  onOutputChunk: (chunk: string) => void;
  onReasoningChunk: (chunk: string) => void;
  options: StreamCompletionOptions;
  passName: "primary" | "fallback";
  prompt: string;
  signal: AbortSignal;
  userMessage: string;
}): Promise<PassResult> {
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

        onOutputChunk(chunk);
      },
      onReasoning: (chunk) => {
        reasoningChunkCount += 1;

        if (reasoningChunkCount === 1) {
          log("info", `${passName}-pass-first-reasoning-chunk`, {
            chunkLength: chunk.length,
            preview: previewLogText(chunk),
          });
        }

        onReasoningChunk(chunk);
      },
      onComplete: (fullText) => {
        log("info", `${passName}-pass-complete-callback`, {
          callbackOutputChars: fullText.length,
        });
      },
      onError: (streamError) => {
        hadError = true;
        onError(streamError.message);
        log("error", `${passName}-pass-error`, {
          error: streamError.message,
        });
      },
    },
    signal,
    options,
  );

  log(receivedOutput ? "info" : "warn", `${passName}-pass-finished`, {
    receivedOutput,
    hadError,
    ...result,
  });

  return {
    aborted: result.aborted,
    contentChars: result.contentChars,
    durationMs: result.durationMs,
    finishReason: result.finishReason,
    hadError,
    reasoningChars: result.reasoningChars,
    receivedOutput,
  };
}

export async function runSectionGeneration({
  apiKey,
  currentArticleYaml,
  effectiveReasoningConfig,
  extractedContent,
  generationMode,
  genericSourceChars,
  genericSources,
  model,
  onError,
  onOutputChunk,
  onReasoningChunk,
  prompt,
  promptTokenEstimate,
  reasoningEffort,
  reasoningMode,
  runId,
  sectionKey,
  sectionLabel,
  signal,
  supportsReasoning,
  totalInputTokenEstimate,
  userMessage,
  userMessageTokenEstimate,
}: RunSectionGenerationArgs): Promise<void> {
  const log = createGenerationLogger({
    generationMode,
    model,
    reasoningEffort,
    reasoningMode,
    runId,
    sectionKey,
    sectionLabel,
    supportsReasoning,
  });

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

  try {
    const primaryPassOptions: StreamCompletionOptions = {
      enableReasoning: effectiveReasoningConfig.enableReasoning,
      ...(effectiveReasoningConfig.reasoningEffort
        ? { reasoningEffort: effectiveReasoningConfig.reasoningEffort }
        : {}),
    };

    const primaryPass = await runGenerationPass({
      apiKey,
      log,
      model,
      onError,
      onOutputChunk,
      onReasoningChunk,
      options: primaryPassOptions,
      passName: "primary",
      prompt,
      signal,
      userMessage,
    });

    const shouldRetryWithoutReasoning =
      primaryPassOptions.enableReasoning === true &&
      !signal.aborted &&
      !primaryPass.hadError &&
      !primaryPass.receivedOutput;

    if (shouldRetryWithoutReasoning) {
      const retryMessage =
        primaryPass.finishReason === "length"
          ? "Reasoning used the response budget before YAML was emitted. Retrying without reasoning..."
          : "Reasoning completed without YAML output. Retrying without reasoning...";

      onError(retryMessage);
      onReasoningChunk(
        "\n\n[No YAML was returned from the reasoning pass. Retrying without reasoning.]",
      );
      log("warn", "retrying-without-reasoning", {
        primaryFinishReason: primaryPass.finishReason,
        primaryDurationMs: primaryPass.durationMs,
        primaryContentChars: primaryPass.contentChars,
        primaryReasoningChars: primaryPass.reasoningChars,
      });

      const fallbackPass = await runGenerationPass({
        apiKey,
        log,
        model,
        onError,
        onOutputChunk,
        onReasoningChunk,
        options: { enableReasoning: false },
        passName: "fallback",
        prompt,
        signal,
        userMessage,
      });

      if (!fallbackPass.hadError && fallbackPass.receivedOutput) {
        onError(null);
        log("info", "generation-finished-with-fallback-output", {
          fallbackFinishReason: fallbackPass.finishReason,
          fallbackDurationMs: fallbackPass.durationMs,
          fallbackContentChars: fallbackPass.contentChars,
        });
      } else if (!fallbackPass.hadError && !fallbackPass.receivedOutput) {
        const failureMessage =
          fallbackPass.finishReason === "length"
            ? "Generation hit the output budget before any YAML was returned. This is usually token exhaustion rather than a timeout. Try a smaller source set or a larger-context model like Gemini 3 Pro."
            : "Generation completed but returned no YAML at all. This is usually an upstream model/output-budget issue rather than a timeout. Try Gemini 3 Pro/Flash or reduce the source/context size.";

        onError(failureMessage);
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
      const failureMessage =
        primaryPass.finishReason === "length"
          ? "Generation hit the output budget before any YAML was returned. This is usually token exhaustion rather than a timeout."
          : "Generation completed without any YAML output.";

      onError(failureMessage);
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
      onError(generationError.message);
      log("error", "generation-threw", {
        error: generationError.message,
      });
    }
  }
}
