import "server-only";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import type { Segment } from "../../scripts/translation/segment-manifest.mjs";
import type { ReviewSnapshot } from "./reviewTypes";
import { narrativeContext, narrativeIdentity, narrativeFieldVersion } from "./narrativeIdentity";
/** Read-only overlay. Automatic writers own the machine table, never these approvals. */
export async function approvedNarrativeOverlay(locale: string, kind: string, segments: readonly Segment[], machine: Map<string, string>) {
    if (!segments.length || locale === "en")
        return { segments: [...segments], translations: machine };
    const ids = segments.map((s) => narrativeIdentity(kind, s));
    const approved = new Map<string, ReviewSnapshot>();
    for (let start = 0; start < ids.length; start += 1000) {
        const rows = await getPostgresClient().sql<{
            source_id: string;
            approved: ReviewSnapshot;
        }>('SELECT source_id,approved FROM "translationReviewEntries" WHERE locale=$1 AND scope=\'narrative\' AND source_id=ANY($2::text[]) AND approved IS NOT NULL', [locale, ids.slice(start, start + 1000)]);
        for (const row of rows)
            approved.set(row.source_id, row.approved);
    }
    const translations = new Map(machine);
    const scoped = segments.map((s, i) => {
        const a = approved.get(ids[i]);
        if (!a || a.source !== s.source || a.context !== narrativeContext(kind, s, narrativeFieldVersion(segments, s)))
            return s;
        const hash = `review:${ids[i]}`;
        translations.set(hash, a.target);
        return { ...s, hash };
    });
    return { segments: scoped, translations };
}
