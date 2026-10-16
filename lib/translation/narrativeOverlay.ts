import "server-only";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import type { Segment } from "../../scripts/translation/segment-manifest.mjs";
import { narrativeOverlayApplies, type NarrativeOverlayDecision, type ReviewSnapshot } from "./reviewTypes";
import { narrativeIdentity, narrativeOverlayDecision } from "./narrativeIdentity";
export type { NarrativeOverlayDecision } from "./reviewTypes";
export async function approvedNarrativeOverlay(locale: string, kind: string, segments: readonly Segment[], machine: Map<string, string>) {
    if (!segments.length || locale === "en")
        return { segments: [...segments], translations: machine, decisions: segments.map((): NarrativeOverlayDecision | null => null), approvedAt: segments.map((): number | null => null) };
    const ids = segments.map((s) => narrativeIdentity(kind, s));
    const approved = new Map<string, ReviewSnapshot>();
    const approvedTimes = new Map<string, number>();
    for (let start = 0; start < ids.length; start += 1000) {
        const rows = await getPostgresClient().sql<{
            source_id: string;
            approved: ReviewSnapshot;
            approved_at: string | number;
        }>('SELECT e.source_id,e.approved,COALESCE((SELECT max(h.created_at) FROM "translationReviewHistory" h WHERE h.locale=e.locale AND h.scope=e.scope AND h.source_id=e.source_id AND h.action=\'approve\'),e.updated_at) AS approved_at FROM "translationReviewEntries" e WHERE e.locale=$1 AND e.scope=\'narrative\' AND e.source_id=ANY($2::text[]) AND e.approved IS NOT NULL', [locale, ids.slice(start, start + 1000)]);
        for (const row of rows) {
            approved.set(row.source_id, row.approved);
            approvedTimes.set(row.source_id, Number(row.approved_at));
        }
    }
    const translations = new Map(machine);
    const decisions: (NarrativeOverlayDecision | null)[] = [];
    const approvedAt: (number | null)[] = [];
    const scoped = segments.map((s, i) => {
        const a = approved.get(ids[i]);
        const decision = a ? narrativeOverlayDecision(kind, segments, s, a) : null;
        decisions.push(decision);
        approvedAt.push(a ? approvedTimes.get(ids[i]) ?? null : null);
        if (!a || !narrativeOverlayApplies(decision))
            return s;
        const hash = `review:${ids[i]}`;
        translations.set(hash, a.target);
        return { ...s, hash };
    });
    return { segments: scoped, translations, decisions, approvedAt };
}
