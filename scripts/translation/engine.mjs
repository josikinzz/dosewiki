/**
 * The model-facing core shared by the batch CLI (`translate.mjs`) and the live
 * refresh (`lib/translation/translateSegments.ts`): batch planning, one
 * request with transport retries, reply parsing, and the validate-and-retry
 * loop that decides which targets are fit to ship. No file or network side
 * effects at import time, so a server bundle can load it.
 */
import { callOpenRouterChat } from "../lib/openrouter-sdk.mjs";
import { buildBatchPrompt } from "./locales.mjs";
import { validateSegment, isBlocking, parseModelJson, DEFECT_CODES } from "./validate.mjs";

export const DEFAULT_MODEL = "z-ai/glm-5.3-flash";
export const APP_TITLE = "dose.wiki locale translation";
export const DEFAULT_BATCH_CHARS = 6000;

/** Validation retries per segment, including the first attempt. */
export const MAX_ATTEMPTS = 3;
const TRANSPORT_ATTEMPTS = 4;

/**
 * A request that never answers is worse than one that fails: the worker holds
 * a slot forever and the pool drains to nothing. The deadline lives here so
 * Node and Bun both honour it. An abandoned attempt is a retryable one.
 */
const ATTEMPT_TIMEOUT_MS = 180_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withDeadline(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error(`request exceeded ${ms}ms`), { retryable: true })),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Packs work units into requests under a character budget. Units keep their
 * context class within a batch so the safety reminder is never diluted, and an
 * oversized unit travels alone.
 */
export function planBatches(units, batchChars = DEFAULT_BATCH_CHARS) {
  const batches = [];
  const open = new Map();

  for (const unit of units) {
    if (unit.source.length >= batchChars) {
      batches.push([unit]);
      continue;
    }

    const key = unit.contextClass;
    const current = open.get(key);
    if (current && current.chars + unit.source.length <= batchChars && current.units.length < 40) {
      current.units.push(unit);
      current.chars += unit.source.length;
      continue;
    }

    if (current) batches.push(current.units);
    open.set(key, { units: [unit], chars: unit.source.length });
  }

  for (const current of open.values()) {
    if (current.units.length > 0) batches.push(current.units);
  }

  return batches;
}

/**
 * One request carrying many segments. Rate limits and gateway errors are the
 * normal weather at this concurrency, so a retryable failure waits and repeats
 * the same request rather than degrading into per-segment retries.
 */
export async function sendBatch({ locale, model, apiKey, userMessage }) {
  let lastError;
  for (let attempt = 1; attempt <= TRANSPORT_ATTEMPTS; attempt += 1) {
    try {
      return await withDeadline(
        callOpenRouterChat({
          apiKey,
          appTitle: APP_TITLE,
          model,
          systemPrompt: locale.systemPrompt,
          userMessage,
          temperature: 0.2,
          maxTokens: 16384,
          // This endpoint reasons unconditionally. Lowest effort with the trace
          // excluded keeps a 6k-character batch near two seconds instead of fifty.
          reasoningEffort: "low",
          excludeReasoning: true,
        }),
        ATTEMPT_TIMEOUT_MS,
      );
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt === TRANSPORT_ATTEMPTS) throw error;
      await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 500);
    }
  }
  throw lastError;
}

export async function translateBatch({ units, locale, model, apiKey, retryNote }) {
  const idByHash = new Map(units.map((unit, index) => [unit.hash, `s${index}`]));
  const payloadUnits = units.map((unit) => ({ ...unit, id: idByHash.get(unit.hash) }));
  const userMessage = buildBatchPrompt(locale, payloadUnits, { retryNote });

  const response = await sendBatch({ locale, model, apiKey, userMessage });

  const usage = {
    prompt: response.usage.promptTokens,
    completion: response.usage.completionTokens,
  };

  const parsed = parseModelJson(response.content);
  if (!parsed.ok) {
    return { usage, results: units.map((unit) => ({ unit, target: null, parseCode: parsed.code })) };
  }

  return {
    usage,
    results: payloadUnits.map((unit) => ({
      unit,
      target: parsed.value[unit.id] ?? null,
      parseCode: parsed.value[unit.id] === undefined ? DEFECT_CODES.UNPARSABLE_OUTPUT : null,
    })),
  };
}

export function retryNoteFor(defects) {
  const notes = [];
  if (defects.includes(DEFECT_CODES.NUMBER_MISMATCH)) {
    notes.push("a number, dose, or unit changed; copy every digit and unit exactly");
  }
  if (defects.includes(DEFECT_CODES.SCRIPT_LEAK)) {
    notes.push("a Traditional character appeared; emit Simplified characters only");
  }
  if (defects.includes(DEFECT_CODES.CITATION_LOSS)) {
    notes.push("a [cite:...] marker was dropped or altered; reproduce every marker verbatim");
  }
  if (defects.includes(DEFECT_CODES.MARKUP_LOSS)) {
    notes.push("an inline [tag] was dropped, added, or altered; reproduce every bracket tag exactly");
  }
  if (defects.includes(DEFECT_CODES.PLACEHOLDER_LOSS)) {
    notes.push("a {{token}} was dropped or altered; copy every token exactly, braces included");
  }
  if (defects.includes(DEFECT_CODES.UNTRANSLATED)) {
    notes.push("the text came back untranslated");
  }
  if (defects.includes(DEFECT_CODES.LENGTH_BAND)) {
    notes.push("the output length was implausible; translate every clause without padding");
  }
  if (defects.includes(DEFECT_CODES.EMPTY_OUTPUT) || defects.includes(DEFECT_CODES.UNPARSABLE_OUTPUT)) {
    notes.push("the reply was empty or not valid JSON");
  }
  return notes.join("; ");
}

/**
 * Translate one planned batch to a verdict per unit: the batch goes out once,
 * then each unit whose reply fails a blocking check is re-sent alone with the
 * defect named, up to `MAX_ATTEMPTS`. Returns every unit with its final
 * target, defects, and attempt count; the caller decides what to keep, and
 * `isBlocking(defects)` is the line between shippable and not.
 */
export async function translateBatchWithRetries({ units, locale, model, apiKey, onUsage }) {
  const attemptUnits = async (unitsToRun, attempt, retryNote) => {
    const { usage, results } = await translateBatch({ units: unitsToRun, locale, model, apiKey, retryNote });
    onUsage?.(usage, attempt);
    return results;
  };

  let results;
  try {
    results = await attemptUnits(units, 1);
  } catch (error) {
    results = units.map((unit) => ({ unit, target: null, parseCode: DEFECT_CODES.UNPARSABLE_OUTPUT, error }));
  }

  const verdicts = [];
  for (const result of results) {
    const unit = result.unit;
    let target = result.target;
    let evaluation = typeof target === "string"
      ? validateSegment({ source: unit.source, target, locale, markup: unit.markup })
      : { defects: [result.parseCode ?? DEFECT_CODES.EMPTY_OUTPUT], details: {} };
    let attempts = 1;

    while (isBlocking(evaluation.defects) && attempts < MAX_ATTEMPTS) {
      attempts += 1;
      try {
        const retry = await attemptUnits([unit], attempts, retryNoteFor(evaluation.defects));
        target = retry[0]?.target ?? null;
        evaluation = typeof target === "string"
          ? validateSegment({ source: unit.source, target, locale, markup: unit.markup })
          : { defects: [retry[0]?.parseCode ?? DEFECT_CODES.EMPTY_OUTPUT], details: {} };
      } catch {
        evaluation = { defects: [DEFECT_CODES.UNPARSABLE_OUTPUT], details: {} };
      }
    }

    verdicts.push({
      unit,
      target: typeof target === "string" ? target : "",
      defects: evaluation.defects,
      details: evaluation.details,
      attempts,
    });
  }
  return verdicts;
}
