export type OpenRouterChatUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type OpenRouterChatResult = {
  content: string;
  finishReason: string | null;
  reasoning: string | null;
  usage: OpenRouterChatUsage;
  response: unknown;
};

export class OpenRouterChatError extends Error {
  constructor(input: { status: number | null; message: string; retryable: boolean; cause?: unknown });
  readonly status: number | null;
  readonly retryable: boolean;
}

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
  signal?: AbortSignal;
}): Promise<OpenRouterChatResult>;
