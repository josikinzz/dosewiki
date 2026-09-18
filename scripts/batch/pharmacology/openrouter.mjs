import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import { createBatchOpenRouterAdapter } from "../lib/openrouter-adapter.mjs";
import { CONFIG } from "./cli.mjs";

function ensureDebugDir() {
  if (!existsSync(CONFIG.debugDir)) {
    mkdirSync(CONFIG.debugDir, { recursive: true });
  }
}

export function writeOpenRouterDebugArtifact({ debugContext, suffix, payload, metadata = {} }) {
  if (!debugContext?.slug) {
    return;
  }

  ensureDebugDir();
  const baseName = `${debugContext.slug.replace(/[^a-z0-9_-]+/gi, "_")}-${suffix}`;
  const payloadPath = join(CONFIG.debugDir, `${baseName}.txt`);
  const metaPath = join(CONFIG.debugDir, `${baseName}-meta.json`);
  writeFileSync(payloadPath, `${payload ?? ""}`, "utf8");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        slug: debugContext.slug,
        title: debugContext.title,
        payloadPath,
        ...metadata,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function createOpenRouterCaller({
  apiKey,
  config = CONFIG,
  writeDebugArtifact = writeOpenRouterDebugArtifact,
}) {
  const adapter = createBatchOpenRouterAdapter({
    apiKey,
    appTitle: "Dose.wiki Batch Pharmacology Generator",
    config,
    writeDebugArtifact,
    emptyContentDebugSuffix: "openrouter-empty-content",
    retryWithoutReasoningOnEmptyLength: true,
  });

  return async function invokeOpenRouter(systemPrompt, userMessage, debugContext = null, options = {}) {
    const response = await adapter.call({ systemPrompt, userMessage, debugContext, options });
    return {
      content: response.content,
      usage: response.usage,
    };
  };
}

export async function callOpenRouter(apiKey, systemPrompt, userMessage, debugContext = null, options = {}) {
  return createOpenRouterCaller({ apiKey })(systemPrompt, userMessage, debugContext, options);
}

export async function callWithRetry(fn, attempts = CONFIG.retryAttempts) {
  return createBatchOpenRouterAdapter({
    apiKey: null,
    appTitle: "Dose.wiki Batch Pharmacology Generator",
    config: CONFIG,
  }).callWithRetry(fn, attempts);
}
