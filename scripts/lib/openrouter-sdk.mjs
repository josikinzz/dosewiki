import { OpenRouter } from "@openrouter/sdk";
import { OpenRouterError } from "@openrouter/sdk/models/errors";

const OPENROUTER_HTTP_REFERER = "https://dose.wiki";

const ERROR_MESSAGES = {
  401: "Invalid API key. Please check your OpenRouter API key.",
  402: "Insufficient credits. Please add credits to your OpenRouter account.",
  429: "Rate limited. Please wait a moment and try again.",
  500: "OpenRouter server error. Please try again later.",
  503: "Model temporarily unavailable. Try a different model.",
};

function createOpenRouterClient(apiKey, appTitle) {
  return new OpenRouter({
    apiKey,
    httpReferer: OPENROUTER_HTTP_REFERER,
    appTitle,
  });
}

function extractTextFromStructuredContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((entry) => extractTextFromStructuredContent(entry)).join("\n").trim();
  }

  if (!content || typeof content !== "object") {
    return "";
  }

  if (typeof content.text === "string") {
    return content.text;
  }

  if (typeof content.content === "string") {
    return content.content;
  }

  if (Array.isArray(content.content)) {
    return extractTextFromStructuredContent(content.content);
  }

  if (Array.isArray(content.parts)) {
    return extractTextFromStructuredContent(content.parts);
  }

  return "";
}

function extractReasoningText(details) {
  if (!Array.isArray(details) || details.length === 0) {
    return "";
  }

  return details
    .map((detail) => (detail && typeof detail === "object" && typeof detail.text === "string" ? detail.text : ""))
    .join("");
}

function isClaudeExplicitReasoningModel(model) {
  return /anthropic\/claude-(?:opus|sonnet)-4\.[56]$/.test(model)
    || /anthropic\/claude-4\.[56]-(?:opus|sonnet)$/.test(model);
}

function getClaudeReasoningMaxTokens(reasoningEffort) {
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

function buildChatRequest({
  model,
  systemPrompt,
  userMessage,
  temperature = 0.3,
  maxTokens = 16384,
  stream = false,
  reasoningEffort,
  disableReasoning = false,
  excludeReasoning = false,
}) {
  const request = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    stream,
    temperature,
    maxTokens,
  };

  // Some endpoints reason unconditionally and reject reasoning.enabled=false.
  // Asking for the lowest effort and excluding the trace is the only way to
  // stop paying for tokens the caller will never read.
  if (excludeReasoning) {
    request.reasoning = { effort: reasoningEffort || "low", exclude: true };
    return request;
  }

  if (!disableReasoning && reasoningEffort) {
    request.reasoning = isClaudeExplicitReasoningModel(model)
      ? {
          enabled: true,
          maxTokens: getClaudeReasoningMaxTokens(reasoningEffort),
        }
      : {
          effort: reasoningEffort,
        };
  }

  return request;
}

function normalizeUsage(usage) {
  return {
    promptTokens: usage?.promptTokens || 0,
    completionTokens: usage?.completionTokens || 0,
    totalTokens: usage?.totalTokens || 0,
  };
}

function normalizeError(error) {
  if (error instanceof OpenRouterError) {
    const status = error.statusCode;
    return {
      status,
      message: ERROR_MESSAGES[status] || error.message || `API error: ${status}`,
      retryable: status === 429 || status >= 500,
      cause: error,
    };
  }

  if (error instanceof Error) {
    return {
      status: null,
      message: error.message,
      retryable: true,
      cause: error,
    };
  }

  return {
    status: null,
    message: String(error),
    retryable: true,
    cause: error,
  };
}

export async function callOpenRouterChat({
  apiKey,
  appTitle,
  model,
  systemPrompt,
  userMessage,
  temperature = 0.3,
  maxTokens = 16384,
  reasoningEffort,
  disableReasoning = false,
  excludeReasoning = false,
  signal,
}) {
  try {
    signal?.throwIfAborted();
    const client = createOpenRouterClient(apiKey, appTitle);
    // The SDK's backoff sleep cannot be aborted. Signal-bearing callers own
    // retries so cancellation cannot leave an SDK retry waiting in the background.
    const response = await client.chat.send({
      chatRequest: buildChatRequest({
        model,
        systemPrompt,
        userMessage,
        temperature,
        maxTokens,
        reasoningEffort,
        disableReasoning,
        excludeReasoning,
      }),
    }, signal ? { signal, retries: { strategy: "none" } } : undefined);
    signal?.throwIfAborted();

    const choice = response?.choices?.[0];
    const message = choice?.message;

    return {
      content: extractTextFromStructuredContent(message?.content),
      finishReason: typeof choice?.finishReason === "string" ? choice.finishReason : null,
      reasoning: typeof message?.reasoning === "string"
        ? message.reasoning
        : extractReasoningText(message?.reasoningDetails),
      usage: normalizeUsage(response?.usage),
      response,
    };
  } catch (error) {
    signal?.throwIfAborted();
    throw normalizeError(error);
  }
}
