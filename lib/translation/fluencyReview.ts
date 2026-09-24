/**
 * The model fluency review of one substance article, started by an admin. A
 * model reads the article's English beside the wording readers see now and
 * proposes local edits; each proposal that passes the blocking validator and
 * the glossary conflict check is stored as an Inbox suggestion. Nothing
 * applies by itself: Accept saves a `narrative` draft with reason Fluency,
 * never an approval.
 *
 * Suggestions live in the review tables under scope `model-suggestion`, one
 * entry per sentence and edit, as a draft until a person accepts it (the
 * accept approves the suggestion entry, which marks it resolved). Each carries
 * the model, run id, prompt version, and token use of its request. A
 * suggestion expires, and leaves the Inbox, when its sentence's English or the
 * wording readers see changes. Each run also saves a `run:<slug>` entry whose
 * history records every run's model, prompt version, token use, and drops.
 *
 * One run per article at a time, across processes, through the translation
 * worker lease table; requests share the pool's `review` quota and go through
 * the pipeline's provider client (`sendBatch`), so they count against the
 * same ceiling and retry rules as translation.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { DEFAULT_MODEL, sendBatch, TranslationTransportError } from "../../scripts/translation/engine.mjs";
import { resolveLocale, type TranslationLocale } from "../../scripts/translation/locales.mjs";
import { styleGuidePromptLines } from "../../scripts/translation/style-guide.mjs";
import type { Segment } from "../../scripts/translation/segment-manifest.mjs";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import {
  buildFluencyPrompt,
  checkFluencyProposal,
  checkFluencyProposals,
  chunkFluencyParagraphs,
  emptyFluencyDrops,
  FLUENCY_APP_TITLE,
  fluencyPromptVersion,
  fluencySystemPrompt,
  parseFluencyReply,
  type FluencyDrops,
  type FluencyGlossaryTerm,
  type FluencyParagraph,
  type FluencySuggestion,
} from "./fluencyReviewPrompt";
import { readGlossaryRows } from "./glossary";
import { loadApprovedStyleGuide } from "./approvedStyleGuide";
import { readTranslationRecord, segmentsOf } from "./liveTranslation";
import { narrativeIdentity, narrativeOverlayDecision, narrativeOwnSourceHash, narrativeSourceVersion } from "./narrativeIdentity";
import { planNarrativeReview } from "./narrativeReview";
import { createTranslationRequestPool, TRANSLATION_REQUEST_QUOTA } from "./requestPool";
import { narrativeSegmentHref, type InboxItem } from "./reviewInboxTypes";
import {
  lockReviewEntry,
  mutateReviewEntries,
  mutateReviewEntryInTransaction,
  readReviewEntries,
  TranslationReviewConflictError,
  TranslationReviewError,
} from "./reviewStore";
import type { ReviewEntry, ReviewMutation } from "./reviewTypes";
import { REVIEW_REASON_NOTE_MAX, type ReviewReason } from "./reviewReason";
import { acquireTranslationWorkerLease, readTranslationCoverageRows, releaseTranslationWorkerLease } from "./segmentStore";

export const FLUENCY_MODEL = DEFAULT_MODEL;
/** Longer than the route's 300 s budget, so a crashed run frees the article soon after. */
const RUN_LEASE_MS = 330_000;
const RUN_KEY_PREFIX = "run:";
/** Process-wide: every fluency request in this process shares the review quota. */
const reviewPool = createTranslationRequestPool(TRANSLATION_REQUEST_QUOTA.review);

/** The reason a Fluency draft carries in review history. */
export function fluencyDraftReason(note: string, runId: string): ReviewReason {
  return { kind: "fluency", note: `${note} (model suggestion, run ${runId})`.slice(0, REVIEW_REASON_NOTE_MAX) };
}

type Usage = { prompt: number; completion: number };
/** What a stored suggestion's context records. */
type SuggestionContext = {
  kind: "article";
  slug: string;
  /** Narrative identity of the sentence. */
  id: string;
  field: string;
  sourceHash: string;
  /** The wording readers saw when the model read it; a change expires the suggestion. */
  before: string;
  current: string;
  suggested: string;
  reason: string;
  model: string;
  runId: string;
  promptVersion: string;
  usage: Usage;
  createdAt: number;
};

type ArticleSentence = { segment: Segment; id: string; live: string | null; humanApproved: boolean; narrative: ReviewEntry | undefined };

/** Each sentence of one article with the wording readers see now: a current human approval, else the stored machine target. */
async function readArticleSentences(reads: PublicDataReadAdapter, locale: string, slug: string) {
  const record = await readTranslationRecord(reads, "article", slug);
  if (!record) throw new TranslationReviewError("No public substance article exists at this slug.", 404);
  const canonical = "slug" in record && typeof record.slug === "string" ? record.slug : slug;
  const segments = segmentsOf({ ...record, slug: canonical }, "article");
  const entries = new Map((await readReviewEntries(locale, "narrative")).map((entry) => [entry.sourceId, entry]));
  const machine = new Map((await readTranslationCoverageRows(locale, [...new Set(segments.map((segment) => segment.hash))])).map((row) => [row.hash, row.target]));
  const sentences: ArticleSentence[] = segments.map((segment) => {
    const id = narrativeIdentity("article", segment);
    const narrative = entries.get(id);
    const decision = narrative?.approved ? narrativeOverlayDecision("article", segments, segment, narrative.approved) : null;
    const applies = decision === "apply" || decision === "apply-recheck";
    const live = applies ? narrative!.approved!.target : machine.get(segment.hash)?.trim() ? machine.get(segment.hash)! : null;
    return { segment, id, live, humanApproved: decision === "apply", narrative };
  });
  return { slug: canonical, segments, sourceVersion: narrativeSourceVersion(segments), sentences };
}

async function approvedGlossary(locale: string): Promise<FluencyGlossaryTerm[]> {
  return (await readGlossaryRows(locale, { status: "approved" }))
    .filter((row) => row.status === "approved")
    .map((row) => ({ term: row.term, target: row.target, kind: row.kind }));
}

function suggestionKey(id: string, suggestion: Pick<FluencySuggestion, "current" | "suggested">): string {
  return `${id}:${createHash("sha256").update(`${suggestion.current}\u0000${suggestion.suggested}`).digest("hex").slice(0, 16)}`;
}

function parseContext(entry: ReviewEntry): SuggestionContext | null {
  try {
    const value: unknown = JSON.parse((entry.draft ?? entry.approved)?.context ?? "");
    return value && typeof value === "object" && (value as SuggestionContext).kind === "article" ? (value as SuggestionContext) : null;
  } catch {
    return null;
  }
}

/** Whether a suggestion still applies: same English, same own source, and readers still see the wording it was made for. */
function stillCurrent(context: SuggestionContext, source: string, sentence: ArticleSentence | undefined): sentence is ArticleSentence {
  return Boolean(sentence && sentence.segment.source === source && narrativeOwnSourceHash(sentence.segment) === context.sourceHash && sentence.live === context.before);
}

export type FluencyRunSummary = {
  runId: string;
  locale: string;
  slug: string;
  model: string;
  promptVersion: string;
  usage: Usage & { requests: number };
  /** Sentences sent to the model; human-approved and untranslated sentences are not. */
  reviewed: number;
  /** Sentences over the request cap, not reviewed this run. */
  skipped: number;
  stored: number;
  dropped: FluencyDrops;
};

/**
 * Runs one fluency review of one article and stores what passes. Refuses (409)
 * while another run for the same article holds its lease; the write freeze
 * fails closed before any model request.
 */
export async function runFluencyReview(input: {
  reads: PublicDataReadAdapter;
  locale: string;
  slug: string;
  apiKey: string;
  actor: string;
  signal?: AbortSignal;
  /** Style guide text for the prompt; omitted, the locale's approved style guide is loaded. */
  styleGuide?: string;
}): Promise<FluencyRunSummary> {
  assertDataWritesNotFrozen("runFluencyReview");
  const locale: TranslationLocale = resolveLocale(input.locale);
  const runId = randomUUID();
  const lease = `fluency-review:${locale.code}:${input.slug}`;
  if (!(await acquireTranslationWorkerLease(lease, runId, RUN_LEASE_MS)))
    throw new TranslationReviewError("A fluency review of this article is already running. Wait for it to finish.", 409, "FLUENCY_REVIEW_RUNNING");
  try {
    const article = await readArticleSentences(input.reads, locale.code, input.slug);
    const glossary = await approvedGlossary(locale.code);
    // Only the approved guide reaches the model, with examples chosen against this article's English.
    const styleGuide = input.styleGuide ?? styleGuidePromptLines(locale, await loadApprovedStyleGuide(locale.code), article.sentences.map((sentence) => sentence.segment.source).join("\n")).join("\n");
    const systemPrompt = fluencySystemPrompt(locale, styleGuide);
    const promptVersion = fluencyPromptVersion(FLUENCY_MODEL, systemPrompt, glossary);
    const paragraphs: FluencyParagraph[] = article.sentences
      .filter((sentence) => sentence.live && !sentence.humanApproved)
      .map((sentence) => ({ id: sentence.id, field: sentence.segment.path, source: sentence.segment.source, target: sentence.live!, markup: sentence.segment.markup }));
    const { chunks, skipped } = chunkFluencyParagraphs(paragraphs);
    const dropped = emptyFluencyDrops();
    const usage = { prompt: 0, completion: 0, requests: 0 };
    const found: Array<{ suggestion: FluencySuggestion; usage: Usage }> = [];
    try {
      await Promise.all(chunks.map((chunk) => reviewPool.run(async () => {
        const response = await sendBatch({
          locale, model: FLUENCY_MODEL, apiKey: input.apiKey, systemPrompt, appTitle: FLUENCY_APP_TITLE,
          userMessage: buildFluencyPrompt(locale, chunk, glossary), temperature: 0.2, signal: input.signal,
        });
        const used = { prompt: response.usage.promptTokens, completion: response.usage.completionTokens };
        usage.prompt += used.prompt;
        usage.completion += used.completion;
        usage.requests += 1;
        const { proposals, malformed } = parseFluencyReply(response.content, chunk);
        dropped.malformed += malformed;
        for (const suggestion of checkFluencyProposals(proposals, chunk, locale, glossary, dropped)) found.push({ suggestion, usage: used });
      })));
    } catch (error) {
      if (error instanceof TranslationTransportError)
        throw new TranslationReviewError(`The model request failed: ${error.message}`, 502, "FLUENCY_PROVIDER_FAILED");
      throw error;
    }
    const createdAt = Date.now();
    const bySentence = new Map(article.sentences.map((sentence) => [sentence.id, sentence]));
    const summary: FluencyRunSummary = {
      runId, locale: locale.code, slug: article.slug, model: FLUENCY_MODEL, promptVersion, usage,
      reviewed: paragraphs.length - skipped, skipped, stored: 0, dropped,
    };
    summary.stored = await storeSuggestions(locale.code, found.map(({ suggestion, usage: used }) => {
      const segment = bySentence.get(suggestion.paragraphId)!.segment;
      const context: SuggestionContext = {
        kind: "article", slug: article.slug, id: suggestion.paragraphId, field: segment.path, sourceHash: narrativeOwnSourceHash(segment),
        before: suggestion.before, current: suggestion.current, suggested: suggestion.suggested, reason: suggestion.reason,
        model: FLUENCY_MODEL, runId, promptVersion, usage: used, createdAt,
      };
      return { key: suggestionKey(suggestion.paragraphId, suggestion), source: suggestion.source, target: suggestion.after, context };
    }), summary, input.actor);
    return summary;
  } finally {
    await releaseTranslationWorkerLease(lease, runId);
  }
}

/**
 * Stores suggestions and the run record in one transaction. A suggestion a
 * person already accepted, for the same English and wording, is not listed
 * again. Returns how many suggestions were stored.
 */
async function storeSuggestions(
  locale: string,
  suggestions: ReadonlyArray<{ key: string; source: string; target: string; context: SuggestionContext }>,
  summary: FluencyRunSummary,
  actor: string,
): Promise<number> {
  const reason = `Model fluency review, run ${summary.runId}`;
  return getPostgresClient().sqlTransaction(async (tx) => {
    let stored = 0;
    for (const suggestion of suggestions) {
      const existing = await lockReviewEntry(tx, locale, "model-suggestion", suggestion.key);
      if (existing?.approved && !existing.draft && existing.approved.source === suggestion.source && existing.approved.target === suggestion.target) continue;
      await mutateReviewEntryInTransaction(tx, {
        locale, scope: "model-suggestion", sourceId: suggestion.key, expectedRevision: existing?.revision ?? 0, action: "save",
        source: suggestion.source, target: suggestion.target, context: JSON.stringify(suggestion.context), actor, reason,
      });
      stored += 1;
    }
    const runKey = `${RUN_KEY_PREFIX}${summary.slug}`;
    const run = await lockReviewEntry(tx, locale, "model-suggestion", runKey);
    await mutateReviewEntryInTransaction(tx, {
      locale, scope: "model-suggestion", sourceId: runKey, expectedRevision: run?.revision ?? 0, action: "save",
      source: summary.slug, target: JSON.stringify({ ...summary, stored }), context: JSON.stringify({ kind: "run", slug: summary.slug }), actor, reason,
    });
    return stored;
  });
}

/** Open model suggestions that still apply, as Inbox items. Expired ones are not listed. */
export async function modelSuggestionItems(reads: PublicDataReadAdapter, locale: string): Promise<InboxItem[]> {
  const open = new Map<string, Array<{ entry: ReviewEntry; context: SuggestionContext }>>();
  for (const entry of await readReviewEntries(locale, "model-suggestion")) {
    if (!entry.draft || entry.sourceId.startsWith(RUN_KEY_PREFIX)) continue;
    const context = parseContext(entry);
    if (!context) continue;
    open.set(context.slug, [...(open.get(context.slug) ?? []), { entry, context }]);
  }
  const items: InboxItem[] = [];
  for (const [slug, entries] of open) {
    let article: Awaited<ReturnType<typeof readArticleSentences>>;
    try {
      article = await readArticleSentences(reads, locale, slug);
    } catch (error) {
      // A withdrawn article has nothing a reviewer can act on.
      if (error instanceof TranslationReviewError && error.status === 404) continue;
      throw error;
    }
    const byId = new Map(article.sentences.map((sentence) => [sentence.id, sentence]));
    for (const { entry, context } of entries) {
      const sentence = byId.get(context.id);
      if (!stillCurrent(context, entry.draft!.source, sentence)) continue;
      items.push({
        scope: "model",
        id: entry.sourceId,
        reason: "model-suggestion",
        english: sentence.segment.source,
        live: sentence.live,
        suggestion: entry.draft!.target,
        detail: `${context.current} → ${context.suggested}: ${context.reason}`,
        origin: { model: context.model, runId: context.runId, promptVersion: context.promptVersion },
        where: `${slug} · ${sentence.segment.path}`,
        revision: String(entry.revision),
        href: narrativeSegmentHref(locale, slug, context.id),
        accept: { kind: "suggestion-accept", id: entry.sourceId, expectedRevision: entry.revision },
      });
    }
  }
  return items;
}

/**
 * Accept: saves the suggested sentence as a `narrative` draft with reason
 * Fluency and marks the suggestion resolved, in one transaction. Never
 * approves a translation. Refuses (409) a changed revision, an expired
 * suggestion, a suggestion that no longer passes the checks, and a sentence
 * that already has a correction draft in progress.
 */
export async function acceptModelSuggestion(
  reads: PublicDataReadAdapter,
  input: { locale: string; id: string; expectedRevision: number; actor: string },
): Promise<{ narrative: ReviewEntry; suggestion: ReviewEntry }> {
  assertDataWritesNotFrozen("acceptModelSuggestion");
  const locale = resolveLocale(input.locale);
  const entry = (await readReviewEntries(locale.code, "model-suggestion")).find((candidate) => candidate.sourceId === input.id);
  const context = entry && !input.id.startsWith(RUN_KEY_PREFIX) ? parseContext(entry) : null;
  if (!entry || !context) throw new TranslationReviewError("This suggestion does not exist. Reload the inbox.", 404, "MODEL_SUGGESTION_GONE");
  if (entry.revision !== input.expectedRevision || !entry.draft) throw new TranslationReviewConflictError();
  const draft = entry.draft;
  const article = await readArticleSentences(reads, locale.code, context.slug);
  const sentence = article.sentences.find((candidate) => candidate.id === context.id);
  if (!stillCurrent(context, draft.source, sentence))
    throw new TranslationReviewError("The English or the wording readers see changed since the model read it. This suggestion has expired.", 409, "MODEL_SUGGESTION_EXPIRED");
  const paragraph: FluencyParagraph = { id: sentence.id, field: sentence.segment.path, source: sentence.segment.source, target: context.before, markup: sentence.segment.markup };
  const checked = checkFluencyProposal({ paragraphId: sentence.id, current: context.current, suggested: context.suggested, reason: context.reason }, paragraph, locale, await approvedGlossary(locale.code));
  if (!checked.ok || checked.suggestion.after !== draft.target)
    throw new TranslationReviewError("This suggestion no longer passes the validator or the glossary check.", 409, "MODEL_SUGGESTION_EXPIRED");
  const narrative = sentence.narrative;
  if (narrative?.draft && narrativeOverlayDecision("article", article.segments, sentence.segment, narrative.draft) !== "stale")
    throw new TranslationReviewError("A correction draft is already open for this sentence. Edit it in Articles instead.", 409, "NARRATIVE_DRAFT_OPEN");
  const plan = await planNarrativeReview(reads, {
    locale: locale.code, kind: "article", slug: article.slug, id: sentence.id, sourceVersion: article.sourceVersion,
    expectedRevision: narrative?.revision ?? 0, action: "save", target: draft.target, actor: input.actor,
    reason: fluencyDraftReason(context.reason, context.runId),
  });
  const resolve: ReviewMutation = {
    locale: locale.code, scope: "model-suggestion", sourceId: entry.sourceId, expectedRevision: entry.revision, action: "approve",
    source: draft.source, context: draft.context, actor: input.actor, reason: "Accepted as a Fluency draft",
  };
  const [saved, resolved] = await mutateReviewEntries([plan.mutation, resolve], [plan.options]);
  return { narrative: saved, suggestion: resolved };
}
