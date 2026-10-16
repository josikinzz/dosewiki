import "server-only";
import { createHash } from "node:crypto";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import { approvedStyleGuide } from "./approvedStyleGuide";
import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";
import { readNarrativeReview } from "./narrativeReview";
import { CORRECTION_REASON_LABEL, type ReviewReason } from "./reviewReason";
import { lockReviewEntry, mutateReviewEntry, mutateReviewEntryInTransaction, readReviewEntries, readReviewHistory, TranslationReviewError } from "./reviewStore";
import type { ReviewAction, ReviewEntry } from "./reviewTypes";
import {
  EMPTY_STYLE_GUIDE,
  parseStyleGuideDocument,
  readStyleGuideSnapshot,
  STYLE_GUIDE_LIMITS,
  STYLE_GUIDE_SOURCE_ID,
  StyleGuideFormatError,
  type StyleGuideDocument,
  type StyleGuideExample,
  type StyleGuidePacket,
} from "./styleGuideTypes";

const SOURCE = STYLE_GUIDE_SOURCE_ID;
const CONTEXT = JSON.stringify({ kind: "style-guide" });

async function readEntry(locale: string): Promise<ReviewEntry | null> {
  return (await readReviewEntries(locale, "style-guide")).find((entry) => entry.sourceId === SOURCE) ?? null;
}

export async function readStyleGuidePacket(locale: string, { history = false } = {}): Promise<StyleGuidePacket> {
  resolveLocale(locale);
  const entry = await readEntry(locale);
  const approved = readStyleGuideSnapshot(entry?.approved?.target);
  return {
    locale,
    revision: entry?.revision ?? 0,
    draft: readStyleGuideSnapshot(entry?.draft?.target),
    approved,
    approvedRevision: approvedStyleGuide(entry)?.revision ?? "",
    history: history ? await readReviewHistory(locale, "style-guide", SOURCE) : undefined,
  };
}

function manualExample(example: Omit<StyleGuideExample, "id" | "addedAt">) {
  const digest = createHash("sha256").update(`${example.source ?? ""}\u0000${example.before}\u0000${example.after}`).digest("hex").slice(0, 12);
  return { id: `manual:${digest}`, addedAt: Date.now() };
}

function parseGuide(raw: unknown): StyleGuideDocument {
  try {
    return parseStyleGuideDocument(raw, manualExample);
  } catch (error) {
    if (error instanceof StyleGuideFormatError) throw new TranslationReviewError(error.message);
    throw error;
  }
}

export type StyleGuideMutation = {
  locale: string;
  action: ReviewAction;
  expectedRevision: number;
  guide?: unknown;
  restoreRevision?: number;
  actor: string;
  reason: ReviewReason | string;
};

export async function writeStyleGuide(input: StyleGuideMutation) {
  resolveLocale(input.locale);
  const target = input.action === "save" ? JSON.stringify(parseGuide(input.guide)) : undefined;
  return mutateReviewEntry({
    locale: input.locale,
    scope: "style-guide",
    sourceId: SOURCE,
    expectedRevision: input.expectedRevision,
    action: input.action,
    source: SOURCE,
    context: CONTEXT,
    target,
    restoreRevision: input.restoreRevision,
    actor: input.actor,
    reason: input.reason,
  }, {
    onApprove: async (_tx, snapshot) => {
      if (!readStyleGuideSnapshot(snapshot.target)) throw new TranslationReviewError("The saved style guide is unreadable. Save it again before approval.");
    },
  });
}

export type StyleGuidePromotion = {
  locale: string;
  slug: string;
  segment: string;
  revision: number;
  why?: string;
  actor: string;
};

export async function promoteCorrectionToStyleGuide(reads: PublicDataReadAdapter, input: StyleGuidePromotion) {
  resolveLocale(input.locale);
  assertDataWritesNotFrozen("promoteCorrectionToStyleGuide");
  const history = await readReviewHistory(input.locale, "narrative", input.segment);
  const correction = history.find((entry) => entry.revision === input.revision);
  if (!correction || correction.action !== "save" || !correction.after.draft)
    throw new TranslationReviewError("That correction is not in this paragraph's history.", 404);
  if (correction.reason.kind !== "fluency")
    throw new TranslationReviewError("Only a Fluency correction can become a style guide example.");
  const after = correction.after.draft.target;
  let before = correction.before.draft?.target ?? correction.before.approved?.target ?? null;
  if (before === null) {
    const packet = await readNarrativeReview(reads, input.locale, "article", input.slug);
    before = packet.rows.find((row) => row.id === input.segment)?.machine?.target ?? null;
  }
  if (!before?.trim() || before.trim() === after.trim())
    throw new TranslationReviewError("The wording before this correction is no longer stored, so it cannot become an example.", 409);
  const why = (input.why?.trim() || correction.reason.note.trim() || CORRECTION_REASON_LABEL.fluency).slice(0, STYLE_GUIDE_LIMITS.whyChars);
  const example: StyleGuideExample = {
    id: `narrative:${input.segment}:${input.revision}`,
    source: correction.after.draft.source.slice(0, STYLE_GUIDE_LIMITS.exampleChars),
    before: before.trim().slice(0, STYLE_GUIDE_LIMITS.exampleChars),
    after: after.trim().slice(0, STYLE_GUIDE_LIMITS.exampleChars),
    why,
    addedAt: Date.now(),
    origin: { kind: "article", slug: input.slug, segment: input.segment, revision: input.revision },
  };
  return getPostgresClient().sqlTransaction(async (tx) => {
    const current = await lockReviewEntry(tx, input.locale, "style-guide", SOURCE);
    const base = readStyleGuideSnapshot(current?.draft?.target) ?? readStyleGuideSnapshot(current?.approved?.target) ?? EMPTY_STYLE_GUIDE;
    if (base.examples.some((existing) => existing.id === example.id))
      throw new TranslationReviewError("This correction is already on the style guide.", 409);
    const guide = parseGuide({ rules: base.rules, examples: [...base.examples, example] });
    return mutateReviewEntryInTransaction(tx, {
      locale: input.locale,
      scope: "style-guide",
      sourceId: SOURCE,
      expectedRevision: current?.revision ?? 0,
      action: "save",
      source: SOURCE,
      context: CONTEXT,
      target: JSON.stringify(guide),
      actor: input.actor,
      reason: { kind: "fluency", note: `Promoted a correction from ${input.slug}.` },
    });
  });
}
