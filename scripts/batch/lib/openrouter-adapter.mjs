import { callOpenRouterChat } from "../../lib/openrouter-sdk.mjs";

export function getRetryDelayMs(baseDelayMs, attempt) {
  return baseDelayMs * Math.pow(2, attempt);
}

export async function callWithRetry(
  fn,
  {
    attempts,
    retryDelayMs,
    sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
    log = console.log,
    label = null,
  },
) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt === attempts - 1) {
        throw error;
      }

      const delay = getRetryDelayMs(retryDelayMs, attempt);
      const target = label ? ` for ${label}` : "";
      log(`  Retry ${attempt + 1}/${attempts}${target} after ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

function resolveReasoningEffort({ options, config }) {
  return options.reasoningEffort || config.reasoningEffort;
}

function writeEmptyContentDebugArtifact({
  response,
  debugContext,
  emptyContentDebugSuffix,
  writeDebugArtifact,
}) {
  if (!emptyContentDebugSuffix || !writeDebugArtifact) {
    return;
  }

  writeDebugArtifact({
    debugContext,
    suffix: emptyContentDebugSuffix,
    payload: JSON.stringify(response.response, null, 2),
    metadata: {
      title: debugContext?.title,
      finishReason: response.finishReason,
      message: "OpenRouter response contained no extractable message content",
    },
  });
}

export function createBatchOpenRouterAdapter({
  apiKey,
  appTitle,
  config,
  callChat = callOpenRouterChat,
  sleep,
  log = console.log,
  writeDebugArtifact = null,
  emptyContentDebugSuffix = null,
  retryWithoutReasoningOnEmptyLength = false,
}) {
  async function call({ systemPrompt, userMessage, debugContext = null, options = {} }) {
    const response = await callChat({
      apiKey,
      appTitle,
      model: options.model || config.model,
      systemPrompt,
      userMessage,
      temperature: options.temperature ?? config.temperature,
      maxTokens: options.maxTokens ?? config.maxTokens,
      reasoningEffort: resolveReasoningEffort({ options, config }),
      disableReasoning: Boolean(options.disableReasoning),
    });

    if (!response.content.trim()) {
      writeEmptyContentDebugArtifact({
        response,
        debugContext,
        emptyContentDebugSuffix,
        writeDebugArtifact,
      });

      if (
        retryWithoutReasoningOnEmptyLength
        && !options.disableReasoning
        && response.reasoning
        && response.finishReason === "length"
      ) {
        return call({
          systemPrompt,
          userMessage,
          debugContext,
          options: {
            ...options,
            disableReasoning: true,
          },
        });
      }
    }

    return {
      content: response.content,
      usage: response.usage,
      finishReason: response.finishReason,
      reasoning: response.reasoning,
      response: response.response,
    };
  }

  return {
    call,
    callWithRetry(fn, attempts = config.retryAttempts, label = null) {
      return callWithRetry(fn, {
        attempts,
        retryDelayMs: config.retryDelayMs,
        sleep,
        log,
        label,
      });
    },
  };
}
