// OpenRouter API utilities for Article Generator
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

export const DEFAULT_OPENROUTER_MODEL_ID = "anthropic/claude-opus-4.6";
const LEGACY_OPENROUTER_MODEL_IDS: Record<string, string> = {
  "anthropic/claude-opus-4.5": DEFAULT_OPENROUTER_MODEL_ID,
};
const STREAM_MAX_TOKENS = 16384;

export const MODEL_OPTIONS: ModelOption[] = [
  { id: DEFAULT_OPENROUTER_MODEL_ID, label: "Claude Opus 4.6", contextWindow: 200000, provider: "anthropic", description: "Undoubtedly the best model, if the articles fit into its 200k context window." },
  { id: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", contextWindow: 1000000, provider: "google", description: "The best model if Opus 4.6 runs out of context." },
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
   * For Claude 4.6 models, this maps to explicit `reasoning.max_tokens` budgets.
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

export function isClaude46Model(model: string): boolean {
  return /anthropic\/claude-(?:opus|sonnet)-4\.6$/.test(model)
    || /anthropic\/claude-4\.6-(?:opus|sonnet)$/.test(model);
}

export function getClaude46ReasoningMaxTokens(reasoningEffort: ReasoningEffortLevel): number {
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
    if (isClaude46Model(model)) {
      requestBody.reasoning = {
        enabled: true,
        max_tokens: getClaude46ReasoningMaxTokens(reasoningEffort),
      };
    } else {
      requestBody.reasoning = {
        effort: reasoningEffort,
      };
    }
  }

  return requestBody;
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
  const requestBody = buildOpenRouterRequestBody(model, systemPrompt, userMessage, options);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dose.wiki",
      "X-Title": "Dose.wiki Article Generator",
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const statusMessage = ERROR_MESSAGES[response.status];
    throw new Error(
      statusMessage || error.error?.message || `API error: ${response.status} ${response.statusText}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  const startedAt = Date.now();
  let fullText = "";
  let buffer = "";
  let finishReason: string | null = null;
  let contentChunkCount = 0;
  let reasoningChunkCount = 0;
  let contentChars = 0;
  let reasoningChars = 0;
  let sseEventCount = 0;
  let malformedEventCount = 0;
  let doneEventReceived = false;
  let aborted = false;

  let lastReasoningChunk = "";
  let lastContentChunk = "";

  const buildResult = (): StreamCompletionResult => ({
    fullText,
    finishReason,
    durationMs: Date.now() - startedAt,
    responseStatus: response.status,
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
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          doneEventReceived = true;
          continue;
        }
        sseEventCount += 1;

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0] as Record<string, unknown> | undefined;
          const delta = choice?.delta as Record<string, unknown> | undefined;

          if (typeof choice?.finish_reason === "string") {
            finishReason = choice.finish_reason;
          }

          if (callbacks.onReasoning) {
            let reasoningChunk: string | null = null;

            if (typeof delta?.reasoning_content === "string") {
              reasoningChunk = delta.reasoning_content;
            } else if (typeof delta?.reasoning === "string") {
              reasoningChunk = delta.reasoning;
            } else if (Array.isArray(delta?.reasoning_details) && delta.reasoning_details.length > 0) {
              reasoningChunk = delta.reasoning_details
                .map((d: { text?: string }) => d?.text || "")
                .join("");
            }

            if (reasoningChunk && reasoningChunk !== lastReasoningChunk) {
              callbacks.onReasoning(reasoningChunk);
              reasoningChunkCount += 1;
              reasoningChars += reasoningChunk.length;
              lastReasoningChunk = reasoningChunk;
            }
          }

          const contentChunk = extractContentChunk(choice);
          if (contentChunk && contentChunk !== lastContentChunk) {
            fullText += contentChunk;
            callbacks.onChunk(contentChunk);
            contentChunkCount += 1;
            contentChars += contentChunk.length;
            lastContentChunk = contentChunk;
          }
        } catch {
          malformedEventCount += 1;
        }
      }
    }

    callbacks.onComplete(fullText);
    return buildResult();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      aborted = true;
      callbacks.onError(new Error("Generation cancelled"));
    } else {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }

    return buildResult();
  }
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    return false;
  }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
