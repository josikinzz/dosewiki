import "server-only";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { readTranslationRecord, segmentsOf, type TranslationRecordKind } from "./liveTranslation";
import { narrativeContext, narrativeIdentity, narrativeOverlayDecision, narrativeSourceVersion } from "./narrativeIdentity";
import { readTranslationCoverageRows } from "./segmentStore";
import { getTranslationHashUsages } from "./translationCoverage";
import { mutateReviewEntry, readReviewEntries, readReviewHistory, TranslationReviewError, type ReviewMutationOptions } from "./reviewStore";
import type { NarrativeOverlayDecision, NarrativeRowStatus, ReviewAction, ReviewMutation } from "./reviewTypes";
import type { ReviewReason } from "./reviewReason";
import { assertCorrectionKeepsGlossary, glossaryMentionsFor, readGlossaryMentionIndex } from "./glossaryConflictCheck";
import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { validateSegment, BLOCKING_DEFECTS } from "../../scripts/translation/validate.mjs";
async function sourceRecord(reads: PublicDataReadAdapter, kind: TranslationRecordKind, slug: string) {
    const record = await readTranslationRecord(reads, kind, slug);
    if (!record)
        throw new TranslationReviewError("No public source record exists at this location.", 404);
    const canonicalSlug = "slug" in record && typeof record.slug === "string" ? record.slug : slug;
    const segments = segmentsOf({ ...record, slug: canonicalSlug }, kind);
    return { segments, slug: canonicalSlug, sourceVersion: narrativeSourceVersion(segments) };
}
export async function readNarrativeReview(reads: PublicDataReadAdapter, locale: string, kind: TranslationRecordKind, slug: string) {
    resolveLocale(locale);
    const { segments, sourceVersion, slug: canonicalSlug } = await sourceRecord(reads, kind, slug);
    const entries = new Map((await readReviewEntries(locale, "narrative")).map(e => [e.sourceId, e]));
    const hashes = [...new Set(segments.map(s => s.hash))];
    const machine = new Map((await readTranslationCoverageRows(locale, hashes)).map(s => [s.hash, s]));
    const usages = await getTranslationHashUsages(reads, hashes.slice(0, 200), 50);
    const glossary = await readGlossaryMentionIndex(locale);
    const rows = segments.map(s => {
        const id = narrativeIdentity(kind, s), context = narrativeContext(kind, s, segments), e = entries.get(id), active = e?.draft ?? e?.approved;
        const overlay: NarrativeOverlayDecision | null = e?.approved ? narrativeOverlayDecision(kind, segments, s, e.approved) : null;
        const activeDecision = active ? narrativeOverlayDecision(kind, segments, s, active) : null;
        const status: NarrativeRowStatus = activeDecision === "stale" ? "stale" : e?.draft ? "draft" : overlay === "apply-recheck" ? "recheck" : e?.approved ? "approved" : "unreviewed";
        return { id, hash: s.hash, field: s.path, source: s.source, context, machine: machine.get(s.hash) ?? null, revision: e?.revision ?? 0, draft: e?.draft ?? null, approved: e?.approved ?? null,
            overlay, status, usages: usages[s.hash] ?? null,
            // The glossary rows this English mentions: the editor checks approved ones while typing and offers any for a proposal.
            glossary: glossaryMentionsFor(s.source, glossary) };
    });
    // Only an approval that applies without re-check counts; apply-recheck still awaits a person.
    const tally = { humanApproved: rows.filter(r => r.overlay === "apply").length, total: rows.length };
    return { locale, kind, slug: canonicalSlug, sourceVersion, rows, tally };
}
export type NarrativeMutation = {
    locale: string;
    kind: TranslationRecordKind;
    slug: string;
    id: string;
    sourceVersion: string;
    expectedRevision: number;
    action: ReviewAction;
    target?: string;
    restoreRevision?: number;
    actor: string;
    reason: ReviewReason | string;
    /** Approved terms the reviewer marked "Fine here" for this correction. */
    glossaryExceptions?: string[];
};
export async function writeNarrativeReview(reads: PublicDataReadAdapter, input: NarrativeMutation) {
    const plan = await planNarrativeReview(reads, input);
    return mutateReviewEntry(plan.mutation, plan.options);
}
/** The review mutation and checks of one narrative write, for callers that write it with other entries in one transaction. */
export async function planNarrativeReview(reads: PublicDataReadAdapter, input: NarrativeMutation): Promise<{ mutation: ReviewMutation; options: ReviewMutationOptions }> {
    const locale = resolveLocale(input.locale);
    const current = await sourceRecord(reads, input.kind, input.slug);
    if (current.sourceVersion !== input.sourceVersion)
        throw new TranslationReviewError("Source context changed. Reload before reviewing.", 409);
    const segment = current.segments.find(s => narrativeIdentity(input.kind, s) === input.id);
    if (!segment)
        throw new TranslationReviewError("This source segment no longer exists.", 409);
    // A correction that drops an approved term needs the reviewer's explicit exception.
    const glossaryExceptions = input.action === "save" && typeof input.target === "string"
        ? await assertCorrectionKeepsGlossary(input.locale, segment.source, input.target, input.glossaryExceptions)
        : [];
    const mutation: ReviewMutation = { ...input, glossaryExceptions, scope: "narrative", sourceId: input.id, source: segment.source, context: narrativeContext(input.kind, segment, current.segments) };
    return { mutation, options: {
        beforeTransition: async () => {
            if ((await sourceRecord(reads, input.kind, input.slug)).sourceVersion !== input.sourceVersion)
                throw new TranslationReviewError("Source context changed. Reload before reviewing.", 409);
        },
        onApprove: async (_tx, snapshot) => {
            const defects = validateSegment({ source: snapshot.source, target: snapshot.target, locale, markup: segment.markup }).defects.filter(code => BLOCKING_DEFECTS.includes(code));
            if (defects.length)
                throw new TranslationReviewError(`Translation validation failed: ${defects.join(", ")}.`);
        },
    } };
}
export async function narrativeHistory(locale: string, id: string) { resolveLocale(locale); return readReviewHistory(locale, "narrative", id); }
