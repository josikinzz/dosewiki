import { createBatchOpenRouterAdapter } from "../lib/openrouter-adapter.mjs";
import { CONFIG } from "./cli.mjs";

export async function callOpenRouter(apiKey, systemPrompt, userMessage) {
  return createBatchOpenRouterAdapter({
    apiKey,
    appTitle: "Dose.wiki Batch History Culture Generator",
    config: CONFIG,
  }).call({ systemPrompt, userMessage });
}

export async function callWithRetry(fn, attempts = CONFIG.retryAttempts) {
  return createBatchOpenRouterAdapter({
    apiKey: null,
    appTitle: "Dose.wiki Batch History Culture Generator",
    config: CONFIG,
  }).callWithRetry(fn, attempts);
}
