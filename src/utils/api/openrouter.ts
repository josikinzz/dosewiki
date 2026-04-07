// OpenRouter SDK utilities for Article Generator
import { OpenRouter } from "@openrouter/sdk";
import { OpenRouterError } from "@openrouter/sdk/models/errors";
import type { ChatRequest, ChatStreamChunk, ReasoningDetailUnion } from "@openrouter/sdk/models";
import { estimateTokenCount } from "tokenx";

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
  /** Called when reasoning/thinking content is received */
  onReasoning?: (chunk: string) => void;
}

export interface ModelOption {
  id: string;
  label: string;
  contextWindow: number;
  provider: string;
  description: string;
}

export const DEFAULT_OPENROUTER_MODEL_ID = "anthropic/claude-opus-4.5";
const LEGACY_OPENROUTER_MODEL_IDS: Record<string, string> = {
  "anthropic/claude-opus-4.6": DEFAULT_OPENROUTER_MODEL_ID,
};
const STREAM_MAX_TOKENS = 16384;
const OPENROUTER_HTTP_REFERER = "https://dose.wiki";
const OPENROUTER_APP_TITLE = "Dose.wiki Article Generator";

export const MODEL_OPTIONS: ModelOption[] = [
  { id: DEFAULT_OPENROUTER_MODEL_ID, label: "Claude Opus 4.5", contextWindow: 200000, provider: "anthropic", description: "Undoubtedly the best model, if the articles fit into its 200k context window." },
  { id: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", contextWindow: 1000000, provider: "google", description: "The best model if Opus 4.5 runs out of context." },
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", contextWindow: 1000000, provider: "google", description: "The best model for quickly and cheaply experimenting." },
  { id: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast", contextWindow: 2000000, provider: "x-ai", description: "We use this model if the others are overly censored." },
];

export function resolveOpenRouterModelId(modelId: string | null | undefined): string {
  const normalizedModelId = modelId ? LEGACY_OPENROUTER_MODEL_IDS[modelId] ?? modelId : DEFAULT_OPENROUTER_MODEL_ID;
  return MODEL_OPTIONS.some((option) => option.id === normalizedModelId)
    ? normalizedModelId
    : DEFAULT_OPENROUTER_MODEL_ID;
}

export const ERROR_MESSAGES: Record<number, string> = {
  401: "Invalid API key. Please check your OpenRouter API key.",
  402: "Insufficient credits. Please add credits to your OpenRouter account.",
  429: "Rate limited. Please wait a moment and try again.",
  500: "OpenRouter server error. Please try again later.",
  503: "Model temporarily unavailable. Try a different model.",
};

/**
 * Estimate tokens from actual text using tokenx library.
 * More accurate than character-based estimation (~94% accuracy).
 */
export function estimateTokens(text: string): number {
  return estimateTokenCount(text);
}

function createOpenRouterClient(apiKey: string): OpenRouter {
  return new OpenRouter({
    apiKey,
    httpReferer: OPENROUTER_HTTP_REFERER,
    appTitle: OPENROUTER_APP_TITLE,
  });
}

function extractTextFromStructuredContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((entry) => extractTextFromStructuredContent(entry)).join("");
  }

  if (!content || typeof content !== "object") {
    return "";
  }

  const record = content as Record<string, unknown>;

  if (typeof record.text === "string") {
    return record.text;
  }

  if (typeof record.content === "string") {
    return record.content;
  }

  if (Array.isArray(record.content)) {
    return extractTextFromStructuredContent(record.content);
  }

  if (Array.isArray(record.parts)) {
    return extractTextFromStructuredContent(record.parts);
  }

  return "";
}

function extractContentChunk(choice: Record<string, unknown> | undefined): string {
  if (!choice) {
    return "";
  }

  const delta = choice.delta as Record<string, unknown> | undefined;
  const message = choice.message as Record<string, unknown> | undefined;

  return extractTextFromStructuredContent(
    delta?.content ??
      delta?.output_text ??
      delta?.text ??
      message?.content ??
      choice.text ??
      "",
  );
}

export type ReasoningEffortLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface StreamCompletionOptions {
  /** Enable extended thinking/reasoning (default: true for Claude) */
  enableReasoning?: boolean;
  /**
   * For Claude 4.5+ models, this maps to explicit `reasoning.max_tokens` budgets.
   * For older Claude models, this is passed through as `reasoning.effort`.
   */
  reasoningEffort?: ReasoningEffortLevel;
  /** Temperature for generation (default: 0.3) */
  temperature?: number;
}

export interface StreamCompletionResult {
  fullText: string;
  finishReason: string | null;
  durationMs: number;
  responseStatus: number;
  contentChunkCount: number;
  reasoningChunkCount: number;
  contentChars: number;
  reasoningChars: number;
  sseEventCount: number;
  malformedEventCount: number;
  doneEventReceived: boolean;
  aborted: boolean;
}

export function isClaudeExplicitReasoningModel(model: string): boolean {
  return /anthropic\/claude-(?:opus|sonnet)-4\.[56]$/.test(model)
    || /anthropic\/claude-4\.[56]-(?:opus|sonnet)$/.test(model);
}

export function getClaudeReasoningMaxTokens(reasoningEffort: ReasoningEffortLevel): number {
  switch (reasoningEffort) {
    case "minimal":
      return 1024;
    case "low":
      return 2048;
    case "medium":
      return 4096;
    case "high":
      return 6144;
    case "xhigh":
      return 8192;
    default:
      return 2048;
  }
}

export function buildOpenRouterRequestBody(
  model: string,
  systemPrompt: string,
  userMessage: string,
  options: StreamCompletionOptions = {},
): Record<string, unknown> {
  const isClaudeModel = model.includes("claude");
  const {
    enableReasoning = isClaudeModel,
    reasoningEffort = "medium",
    temperature = 0.3,
  } = options;

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    stream: true,
    temperature,
    max_tokens: STREAM_MAX_TOKENS,
  };

  if (enableReasoning) {
    if (isClaudeExplicitReasoningModel(model)) {
      requestBody.reasoning = {
        enabled: true,
        max_tokens: getClaudeReasoningMaxTokens(reasoningEffort),
      };
    } else {
      requestBody.reasoning = {
        effort: reasoningEffort,
      };
    }
  }

  return requestBody;
}

function buildOpenRouterChatRequest(
  model: string,
  systemPrompt: string,
  userMessage: string,
  options: StreamCompletionOptions = {},
): ChatRequest & { stream: true } {
  const requestBody = buildOpenRouterRequestBody(model, systemPrompt, userMessage, options);
  const reasoning = requestBody.reasoning as Record<string, unknown> | undefined;

  return {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    stream: true,
    temperature: requestBody.temperature as number,
    maxTokens: STREAM_MAX_TOKENS,
    ...(reasoning
      ? {
          reasoning: {
            ...(typeof reasoning.effort === "string" ? { effort: reasoning.effort as ReasoningEffortLevel } : {}),
            ...(typeof reasoning.enabled === "boolean" ? { enabled: reasoning.enabled } : {}),
            ...(typeof reasoning.max_tokens === "number" ? { maxTokens: reasoning.max_tokens } : {}),
          },
        }
      : {}),
  };
}

function extractReasoningTextFromDetails(details: ReasoningDetailUnion[] | null | undefined): string {
  if (!Array.isArray(details) || details.length === 0) {
    return "";
  }

  return details
    .map((detail) => ("text" in detail && typeof detail.text === "string" ? detail.text : ""))
    .join("");
}

function extractReasoningChunk(chunk: ChatStreamChunk): string {
  const delta = chunk.choices[0]?.delta;
  if (!delta) {
    return "";
  }

  if (typeof delta.reasoning === "string") {
    return delta.reasoning;
  }

  return extractReasoningTextFromDetails(delta.reasoningDetails);
}

function normalizeStreamFinishReason(chunk: ChatStreamChunk): string | null {
  const finishReason = chunk.choices[0]?.finishReason;
  return typeof finishReason === "string" ? finishReason : null;
}

function normalizeOpenRouterError(error: unknown): Error {
  if (error instanceof OpenRouterError) {
    const statusMessage = ERROR_MESSAGES[error.statusCode];
    return new Error(statusMessage || error.message || `API error: ${error.statusCode}`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

export async function streamCompletion(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  options: StreamCompletionOptions = {}
): Promise<StreamCompletionResult> {
  const client = createOpenRouterClient(apiKey);
  const request = buildOpenRouterChatRequest(model, systemPrompt, userMessage, options);
  const stream = await client.chat.send({ chatRequest: request }, { signal });

  const startedAt = Date.now();
  let fullText = "";
  let finishReason: string | null = null;
  let contentChunkCount = 0;
  let reasoningChunkCount = 0;
  let contentChars = 0;
  let reasoningChars = 0;
  let sseEventCount = 0;
  const malformedEventCount = 0;
  let doneEventReceived = false;
  let aborted = false;

  let lastReasoningChunk = "";
  let lastContentChunk = "";

  const buildResult = (): StreamCompletionResult => ({
    fullText,
    finishReason,
    durationMs: Date.now() - startedAt,
    responseStatus: 200,
    contentChunkCount,
    reasoningChunkCount,
    contentChars,
    reasoningChars,
    sseEventCount,
    malformedEventCount,
    doneEventReceived,
    aborted,
  });

  try {
    for await (const chunk of stream) {
      sseEventCount += 1;

      if (chunk.error) {
        throw new Error(chunk.error.message);
      }

      finishReason = normalizeStreamFinishReason(chunk) ?? finishReason;

      if (callbacks.onReasoning) {
        const reasoningChunk = extractReasoningChunk(chunk);
        if (reasoningChunk && reasoningChunk !== lastReasoningChunk) {
          callbacks.onReasoning(reasoningChunk);
          reasoningChunkCount += 1;
          reasoningChars += reasoningChunk.length;
          lastReasoningChunk = reasoningChunk;
        }
      }

      const choice = chunk.choices[0] as Record<string, unknown> | undefined;
      const contentChunk = extractContentChunk(choice);

      if (contentChunk && contentChunk !== lastContentChunk) {
        fullText += contentChunk;
        callbacks.onChunk(contentChunk);
        contentChunkCount += 1;
        contentChars += contentChunk.length;
        lastContentChunk = contentChunk;
      }
    }

    doneEventReceived = true;
    callbacks.onComplete(fullText);
    return buildResult();
  } catch (error) {
    const normalizedError = normalizeOpenRouterError(error);
    if (signal?.aborted || normalizedError.name === "AbortError" || normalizedError.name === "RequestAbortedError") {
      aborted = true;
      callbacks.onError(new Error("Generation cancelled"));
    } else {
      callbacks.onError(normalizedError);
    }

    return buildResult();
  }
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    return false;
  }
  try {
    const client = createOpenRouterClient(apiKey);
    await client.models.count();
    return true;
  } catch {
    return false;
  }
}
