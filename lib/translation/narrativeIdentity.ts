import { createHash } from "node:crypto";
import type { Segment } from "../../scripts/translation/segment-manifest.mjs";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Stable location, with a separate fingerprint of the surrounding record's source. */
export function narrativeIdentity(kind: string, segment: Segment) {
    return digest([kind, segment.slug, segment.path, segment.span?.index ?? null]);
}
export function narrativeSourceVersion(segments: readonly Segment[]) {
    return digest(segments.map((s) => [s.path, s.hash, s.span ?? null]));
}
export function narrativeContext(kind: string, segment: Segment, version: string) {
    return JSON.stringify({ kind, slug: segment.slug, field: segment.path, sourceVersion: version });
}
export function narrativeFieldVersion(segments: readonly Segment[], segment: Segment) {
    return narrativeSourceVersion(segments.filter((candidate) => candidate.slug === segment.slug && candidate.group === segment.group));
}
