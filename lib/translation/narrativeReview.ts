import "server-only";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { readTranslationRecord, segmentsOf, type TranslationRecordKind } from "./liveTranslation";
import { narrativeContext, narrativeIdentity, narrativeOverlayDecision, narrativeSourceVersion } from "./narrativeIdentity";
import { readTranslationCoverageRows } from "./segmentStore";
import { getTranslationHashUsages } from "./translationCoverage";
import { mutateReviewEntry, readReviewEntries, readReviewHistory, TranslationReviewError } from "./reviewStore";
import type { NarrativeOverlayDecision, NarrativeRowStatus, ReviewAction } from "./reviewTypes";
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
    return { locale, kind, slug: canonicalSlug, sourceVersion, rows: segments.map(s => {
            const id = narrativeIdentity(kind, s), context = narrativeContext(kind, s, segments), e = entries.get(id), active = e?.draft ?? e?.approved;
            const overlay: NarrativeOverlayDecision | null = e?.approved ? narrativeOverlayDecision(kind, segments, s, e.approved) : null;
            const activeDecision = active ? narrativeOverlayDecision(kind, segments, s, active) : null;
            const status: NarrativeRowStatus = activeDecision === "stale" ? "stale" : e?.draft ? "draft" : overlay === "apply-recheck" ? "recheck" : e?.approved ? "approved" : "unreviewed";
            return { id, hash: s.hash, field: s.path, source: s.source, context, machine: machine.get(s.hash) ?? null, revision: e?.revision ?? 0, draft: e?.draft ?? null, approved: e?.approved ?? null,
                overlay, status, usages: usages[s.hash] ?? null };
        }) };
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
    reason: string;
};
export async function writeNarrativeReview(reads: PublicDataReadAdapter, input: NarrativeMutation) {
    const locale = resolveLocale(input.locale);
    const current = await sourceRecord(reads, input.kind, input.slug);
    if (current.sourceVersion !== input.sourceVersion)
        throw new TranslationReviewError("Source context changed. Reload before reviewing.", 409);
    const segment = current.segments.find(s => narrativeIdentity(input.kind, s) === input.id);
    if (!segment)
        throw new TranslationReviewError("This source segment no longer exists.", 409);
    return mutateReviewEntry({ ...input, scope: "narrative", sourceId: input.id, source: segment.source, context: narrativeContext(input.kind, segment, current.segments) }, {
        beforeTransition: async () => {
            if ((await sourceRecord(reads, input.kind, input.slug)).sourceVersion !== input.sourceVersion)
                throw new TranslationReviewError("Source context changed. Reload before reviewing.", 409);
        },
        onApprove: async (_tx, snapshot) => {
            const defects = validateSegment({ source: snapshot.source, target: snapshot.target, locale, markup: segment.markup }).defects.filter(code => BLOCKING_DEFECTS.includes(code));
            if (defects.length)
                throw new TranslationReviewError(`Translation validation failed: ${defects.join(", ")}.`);
        },
    });
}
export async function narrativeHistory(locale: string, id: string) { resolveLocale(locale); return readReviewHistory(locale, "narrative", id); }
