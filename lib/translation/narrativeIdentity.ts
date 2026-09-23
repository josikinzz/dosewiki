import { createHash } from "node:crypto";
import type { Segment } from "../../scripts/translation/segment-manifest.mjs";
import type { NarrativeOverlayDecision, ReviewSnapshot } from "./reviewTypes";
export type { NarrativeOverlayDecision } from "./reviewTypes";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fingerprint = (s: Segment) => [s.path, s.hash, s.span ?? null];
const sameLocation = (a: Segment, b: Segment) => a.path === b.path && (a.span?.index ?? null) === (b.span?.index ?? null);
const fieldGroup = (segments: readonly Segment[], segment: Segment) => segments.filter((candidate) => candidate.slug === segment.slug && candidate.group === segment.group);
/** Stable location, with a separate fingerprint of the surrounding record's source. */
export function narrativeIdentity(kind: string, segment: Segment) {
    return digest([kind, segment.slug, segment.path, segment.span?.index ?? null]);
}
export function narrativeSourceVersion(segments: readonly Segment[]) {
    return digest(segments.map(fingerprint));
}
/** Old-shape fingerprint: every segment in the same slug and field group, the approved one included. */
export function narrativeFieldVersion(segments: readonly Segment[], segment: Segment) {
    return narrativeSourceVersion(fieldGroup(segments, segment));
}
/** The approved segment's own source, independent of its neighbours. */
export function narrativeOwnSourceHash(segment: Segment) {
    return digest(fingerprint(segment));
}
/** The other segments in the same slug and field group. */
export function narrativeNeighbourVersion(segments: readonly Segment[], segment: Segment) {
    return narrativeSourceVersion(fieldGroup(segments, segment).filter((candidate) => !sameLocation(candidate, segment)));
}
/** Old-shape context. Stored approvals in this shape go stale on any change in the field group. */
export function legacyNarrativeContext(kind: string, segment: Segment, version: string) {
    return JSON.stringify({ kind, slug: segment.slug, field: segment.path, sourceVersion: version });
}
/** Context written by new drafts and approvals: own source hash plus a separate neighbour version. */
export function narrativeContext(kind: string, segment: Segment, segments: readonly Segment[]) {
    return JSON.stringify({ kind, slug: segment.slug, field: segment.path, sourceHash: narrativeOwnSourceHash(segment), neighbourVersion: narrativeNeighbourVersion(segments, segment) });
}
function parseContext(context: string): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(context);
        return value && typeof value === "object" ? value as Record<string, unknown> : null;
    }
    catch {
        return null;
    }
}
/**
 * Whether a stored snapshot applies to the current source. An own-source change is stale;
 * a neighbour-only change still applies but needs a human re-check. Old-shape contexts
 * keep the whole-group rule until their next approval.
 */
export function narrativeOverlayDecision(kind: string, segments: readonly Segment[], segment: Segment, snapshot: Pick<ReviewSnapshot, "source" | "context">): NarrativeOverlayDecision {
    if (snapshot.source !== segment.source)
        return "stale";
    const stored = parseContext(snapshot.context);
    if (!stored || !("sourceHash" in stored))
        return snapshot.context === legacyNarrativeContext(kind, segment, narrativeFieldVersion(segments, segment)) ? "apply" : "stale";
    if (stored.kind !== kind || stored.slug !== segment.slug || stored.field !== segment.path || stored.sourceHash !== narrativeOwnSourceHash(segment))
        return "stale";
    return stored.neighbourVersion === narrativeNeighbourVersion(segments, segment) ? "apply" : "apply-recheck";
}
