export type OpenRouterChatUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type OpenRouterChatResult = {
  content: string;
  finishReason: string | null;
  reasoning: string | null;
  usage: OpenRouterChatUsage;
  response: unknown;
};

/** A failed call, normalized: `retryable` is true for rate limits, gateway errors, and transport failures. */
export type OpenRouterChatError = { status: number | null; message: string; retryable: boolean; cause: unknown };

export function callOpenRouterChat(input: {
  apiKey: string;
  appTitle: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high" | "minimal";
  disableReasoning?: boolean;
  excludeReasoning?: boolean;
}): Promise<OpenRouterChatResult>;
