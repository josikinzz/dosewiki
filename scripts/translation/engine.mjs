import { callOpenRouterChat } from "../lib/openrouter-sdk.mjs";
import { buildBatchPrompt } from "./locales.mjs";
import { markupTokens } from "./markup.mjs";
import { validateSegment, isBlocking, parseModelJson, DEFECT_CODES } from "./validate.mjs";

export const DEFAULT_MODEL = "z-ai/glm-5.3-flash";
export const APP_TITLE = "dose.wiki locale translation";
export const DEFAULT_BATCH_CHARS = 6000;

export const MAX_ATTEMPTS = 12;
const TRANSPORT_ATTEMPTS = 4;

const ATTEMPT_TIMEOUT_MS = 180_000;

const PROTECTED_TOKEN_PREFIX = "{{DWPROTECT";

function alphabeticIndex(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(97 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function protectModelTokens(source) {
  const replacements = [];
  const protect = (value) => {
    const token = `${PROTECTED_TOKEN_PREFIX}${alphabeticIndex(replacements.length).toUpperCase()}}}`;
    replacements.push([token, value]);
    return token;
  };

  let protectedSource = source
    .replace(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/g, protect)
    .replace(/\[cite:[^\]]+\]|\[citation-needed\]/g, protect)
    .replace(/(?<=\])\([^\s)]+(?:\s+"[^"]*")?\)/g, protect);

  for (const token of [...new Set(markupTokens(protectedSource))].sort((a, b) => b.length - a.length)) {
    protectedSource = protectedSource.replaceAll(token, () => protect(token));
  }
  protectedSource = protectedSource.replace(/[\uff10-\uff19\d]+(?:[.,][\uff10-\uff19\d]+)*/g, protect);

  return {
    source: protectedSource,
    restore(target) {
      let restored = target;
      for (const [token, value] of [...replacements].reverse()) {
        const label = token.slice(PROTECTED_TOKEN_PREFIX.length, -2);
        const variant = new RegExp(`(?:\\{\\{|｛｛)\\s*DWPROTECT\\s*${label}\\s*(?:\\}\\}|｝｝)`, "gi");
        restored = restored.replace(variant, value);
      }
      return restored;
    },
  };
}

export class TranslationTransportError extends Error {
  constructor(cause) {
    const detail = cause instanceof Error ? cause.message : String(cause?.message ?? cause);
    super(`Provider request failed: ${detail}`, { cause });
    this.name = "TranslationTransportError";
    this.code = DEFECT_CODES.TRANSPORT_FAILURE;
    this.status = typeof cause?.status === "number" ? cause.status : null;
    this.retryable = Boolean(cause?.retryable);
  }
}

function sleep(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function withDeadline(request, ms, signal) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(Object.assign(new Error(`request exceeded ${ms}ms`), { retryable: true })),
    ms,
  );
  let rejectOnAbort;
  try {
    return await new Promise((resolve, reject) => {
      rejectOnAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return request(controller.signal);
      }).then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    controller.signal.removeEventListener("abort", rejectOnAbort);
  }
}

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

export async function sendBatch({ locale, model, apiKey, userMessage, temperature = 0.2, signal, systemPrompt = locale.systemPrompt, appTitle = APP_TITLE }) {
  let lastError;
  for (let attempt = 1; attempt <= TRANSPORT_ATTEMPTS; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await withDeadline(
        (attemptSignal) => callOpenRouterChat({
          apiKey,
          appTitle,
          model,
          systemPrompt,
          userMessage,
          temperature,
          maxTokens: 16384,
          reasoningEffort: "low",
          excludeReasoning: true,
          signal: attemptSignal,
        }),
        ATTEMPT_TIMEOUT_MS,
        signal,
      );
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error;
      if (!error?.retryable || attempt === TRANSPORT_ATTEMPTS) throw new TranslationTransportError(error);
      await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 500, signal);
    }
  }
  throw new TranslationTransportError(lastError);
}

export async function translateBatch({ units, locale, glossary, glosses, kinds, styleGuide = null, model, apiKey, retryNote, temperature, signal }) {
  const idByHash = new Map(units.map((unit, index) => [unit.hash, `s${index}`]));
  const protections = new Map(units.map((unit) => [unit.hash, protectModelTokens(unit.source)]));
  const payloadUnits = units.map((unit) => ({
    ...unit,
    originalSource: unit.source,
    source: protections.get(unit.hash).source,
    id: idByHash.get(unit.hash),
  }));
  const userMessage = buildBatchPrompt(locale, payloadUnits, { retryNote, glossary, glosses, kinds, styleGuide });

  const response = await sendBatch({ locale, model, apiKey, userMessage, temperature, signal });

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
    results: payloadUnits.map((payloadUnit) => ({
      unit: units.find((unit) => unit.hash === payloadUnit.hash),
      target: typeof parsed.value[payloadUnit.id] !== "string"
        ? null
        : protections.get(payloadUnit.hash).restore(parsed.value[payloadUnit.id]),
      parseCode: typeof parsed.value[payloadUnit.id] !== "string" ? DEFECT_CODES.UNPARSABLE_OUTPUT : null,
    })),
  };
}

export function retryNoteFor(defects) {
  const notes = [];
  if (defects.includes(DEFECT_CODES.NUMBER_MISMATCH)) {
    notes.push("a number, dose, or unit changed; copy every digit and unit exactly");
  }
  if (defects.includes(DEFECT_CODES.NUMBER_ADDED)) {
    notes.push("the translation introduced a number that is not in the source; do not add any digits, list numbers, dates, doses, or units");
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
  if (defects.includes(DEFECT_CODES.GLOSSARY_MISS)) {
    notes.push("an approved glossary rendering was missed; use each required glossary target exactly as provided, without synonyms or spelling changes");
  }
  if (defects.includes(DEFECT_CODES.REPEATED_PUNCTUATION)) {
    notes.push("a punctuation mark was doubled (such as ，，); write each full-width mark once");
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

export async function translateBatchWithRetries({ units, locale, glossary, glosses, kinds, styleGuide = null, model, apiKey, onUsage, signal }) {
  const attemptUnits = async (unitsToRun, attempt, retryNote) => {
    signal?.throwIfAborted();
    const { usage, results } = await translateBatch({
      units: unitsToRun,
      locale,
      glossary,
      glosses,
      kinds,
      styleGuide,
      model,
      apiKey,
      retryNote,
      temperature: attempt === 1 ? 0.2 : 0,
      signal,
    });
    signal?.throwIfAborted();
    onUsage?.(usage, attempt);
    return results;
  };

  let results;
  try {
    results = await attemptUnits(units, 1);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof TranslationTransportError) throw error;
    results = units.map((unit) => ({ unit, target: null, parseCode: DEFECT_CODES.UNPARSABLE_OUTPUT, error }));
  }

  const verdicts = [];
  for (const result of results) {
    signal?.throwIfAborted();
    const unit = result.unit;
    let target = result.target;
    let evaluation = typeof target === "string"
      ? validateSegment({ source: unit.source, target, locale, glossary, markup: unit.markup })
      : { defects: [result.parseCode ?? DEFECT_CODES.EMPTY_OUTPUT], details: {} };
    let attempts = 1;

    while (isBlocking(evaluation.defects) && attempts < MAX_ATTEMPTS) {
      attempts += 1;
      try {
        const retry = await attemptUnits([unit], attempts, retryNoteFor(evaluation.defects));
        target = retry[0]?.target ?? null;
        evaluation = typeof target === "string"
          ? validateSegment({ source: unit.source, target, locale, glossary, markup: unit.markup })
          : { defects: [retry[0]?.parseCode ?? DEFECT_CODES.EMPTY_OUTPUT], details: {} };
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof TranslationTransportError) throw error;
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
