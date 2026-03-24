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

export interface StreamCompletionOptions {
  /** Enable extended thinking/reasoning (default: true for Claude) */
  enableReasoning?: boolean;
  /** 
   * Reasoning effort level: "minimal" | "low" | "medium" | "high" | "xhigh"
   * - minimal: 5% of max_tokens for reasoning
   * - low: 20% of max_tokens for reasoning
   * - medium: 50% of max_tokens for reasoning
   * - high: 80% of max_tokens for reasoning  
   * - xhigh: 95% of max_tokens for reasoning
   * Default: "medium"
   */
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  /** Temperature for generation (default: 0.3) */
  temperature?: number;
}

export interface StreamCompletionResult {
  fullText: string;
  finishReason: string | null;
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
  const isClaudeModel = model.includes("claude");
  const {
    enableReasoning = isClaudeModel, // Enable by default for Claude
    reasoningEffort = "medium",
    temperature = 0.3,
  } = options;

  // Build request body
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    stream: true,
    temperature,
    max_tokens: 16384,
  };

  // Add reasoning for supported models (Claude, etc.)
  // OpenRouter uses a unified "reasoning" parameter
  if (enableReasoning) {
    requestBody.reasoning = {
      effort: reasoningEffort,
    };
  }

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
  let fullText = "";
  let buffer = "";
  let finishReason: string | null = null;
  
  // Track last chunks to deduplicate (OpenRouter sometimes sends duplicates)
  let lastReasoningChunk = "";
  let lastContentChunk = "";

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
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0] as Record<string, unknown> | undefined;
          const delta = choice?.delta as Record<string, unknown> | undefined;

          if (typeof choice?.finish_reason === "string") {
            finishReason = choice.finish_reason;
          }
          
          // Handle reasoning content - OpenRouter uses different fields depending on model
          // Only process ONE of these to avoid duplicates
          if (callbacks.onReasoning) {
            let reasoningChunk: string | null = null;
            
            // Prefer reasoning_content (used by some models)
            if (typeof delta?.reasoning_content === "string") {
              reasoningChunk = delta.reasoning_content;
            }
            // Fall back to reasoning (used by other models)
            else if (typeof delta?.reasoning === "string") {
              reasoningChunk = delta.reasoning;
            }
            // Some models use reasoning_details array
            else if (Array.isArray(delta?.reasoning_details) && delta.reasoning_details.length > 0) {
              reasoningChunk = delta.reasoning_details
                .map((d: { text?: string }) => d?.text || "")
                .join("");
            }
            
            // Deduplicate - skip if this is the same as the last chunk
            if (reasoningChunk && reasoningChunk !== lastReasoningChunk) {
              callbacks.onReasoning(reasoningChunk);
              lastReasoningChunk = reasoningChunk;
            }
          }
          
          // Handle regular content
          const contentChunk = extractContentChunk(choice);
          if (contentChunk && contentChunk !== lastContentChunk) {
            fullText += contentChunk;
            callbacks.onChunk(contentChunk);
            lastContentChunk = contentChunk;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    callbacks.onComplete(fullText);
    return { fullText, finishReason };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      callbacks.onError(new Error("Generation cancelled"));
    } else {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }

    return { fullText, finishReason };
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
