import { createBatchOpenRouterAdapter } from "../lib/openrouter-adapter.mjs";
import { CONFIG } from "./cli.mjs";

const adapter = createBatchOpenRouterAdapter({
  apiKey: null,
  appTitle: "Dose.wiki Batch Dosage Duration Generator",
  config: CONFIG,
});

export async function callOpenRouter(apiKey, systemPrompt, userMessage) {
  return createBatchOpenRouterAdapter({
    apiKey,
    appTitle: "Dose.wiki Batch Dosage Duration Generator",
    config: CONFIG,
  }).call({ systemPrompt, userMessage });
}

export async function callWithRetry(fn, attempts = CONFIG.retryAttempts) {
  return adapter.callWithRetry(fn, attempts);
}
