// OpenRouter API utilities for Article Generator

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

export interface ModelOption {
  id: string;
  label: string;
  contextWindow: number;
  provider: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Recommended)", contextWindow: 1050000, provider: "google" },
  { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", contextWindow: 164000, provider: "deepseek" },
  { id: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast", contextWindow: 2000000, provider: "x-ai" },
  { id: "moonshotai/kimi-k2-thinking", label: "Kimi K2 Thinking", contextWindow: 256000, provider: "moonshotai" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", contextWindow: 200000, provider: "anthropic" },
  { id: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5", contextWindow: 1000000, provider: "anthropic" },
  { id: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", contextWindow: 1050000, provider: "google" },
];

export const ERROR_MESSAGES: Record<number, string> = {
  401: "Invalid API key. Please check your OpenRouter API key.",
  402: "Insufficient credits. Please add credits to your OpenRouter account.",
  429: "Rate limited. Please wait a moment and try again.",
  500: "OpenRouter server error. Please try again later.",
  503: "Model temporarily unavailable. Try a different model.",
};

export function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / 4);
}

export async function streamCompletion(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dose.wiki",
      "X-Title": "Dose.wiki Article Generator",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: true,
      temperature: 0.3,
      max_tokens: 16384,
    }),
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
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            callbacks.onChunk(content);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    callbacks.onComplete(fullText);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      callbacks.onError(new Error("Generation cancelled"));
    } else {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
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
