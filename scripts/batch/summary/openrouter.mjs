import { createBatchOpenRouterAdapter } from "../lib/openrouter-adapter.mjs";
import { CONFIG } from "./config.mjs";

export function createOpenRouterCaller({ apiKey, config = CONFIG, writeDebugArtifact }) {
  const adapter = createBatchOpenRouterAdapter({
    apiKey,
    appTitle: "Dose.wiki Batch Summary Generator",
    config,
    emptyContentDebugSuffix: "summary-openrouter-empty-content",
    writeDebugArtifact: ({ debugContext, suffix, payload, metadata }) => {
      writeDebugArtifact({
        slug: debugContext?.slug,
        suffix,
        payload,
        metadata: {
          title: debugContext?.title,
          finishReason: metadata.finishReason,
        },
      });
    },
  });

  return async function callOpenRouter(systemPrompt, userMessage, debugContext = null, options = {}) {
    const response = await adapter.call({
      systemPrompt,
      userMessage,
      debugContext,
      options,
    });

    return {
      content: response.content,
      usage: response.usage,
    };
  };
}
