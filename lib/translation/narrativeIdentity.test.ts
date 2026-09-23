// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Segment } from "../../scripts/translation/segment-manifest.mjs";
import { segmentHash } from "../../scripts/translation/segment-manifest.mjs";
import { legacyNarrativeContext, narrativeContext, narrativeFieldVersion, narrativeOverlayDecision } from "./narrativeIdentity";
import { narrativeOverlayApplies } from "./reviewTypes";

const segment = (path: string, source: string, group = "notes"): Segment => ({ slug: "2-benzylpiperidine", path, pointer: [group], group, markup: false, contextClass: "prose", hash: segmentHash(source), words: source.split(" ").length, source });
const approvedSource = "2-Benzylpiperidine is a stimulant of the piperidine class.";
const neighbourSource = "It is structurally related to methylphenidate.";
const record = (approved = approvedSource, neighbour = neighbourSource, other = "Its effects are poorly documented.") =>
    [segment("notes.0", approved), segment("notes.1", neighbour), segment("summary", other, "summary")];
const snapshot = (segments: Segment[], context = narrativeContext("article", segments[0], segments)) => ({ source: segments[0].source, target: "2-苄基哌啶是一种哌啶类兴奋剂。", context });

describe("narrative overlay decision", () => {
    it("applies an approval whose own source and neighbours are unchanged", () => {
        const segments = record();
        expect(narrativeOverlayDecision("article", segments, segments[0], snapshot(segments))).toBe("apply");
    });
    it("keeps the approval applied for re-check when only a neighbour sentence changes", () => {
        const approved = snapshot(record());
        const edited = record(approvedSource, "It is structurally related to methylphenidate and other phenidates.");
        const decision = narrativeOverlayDecision("article", edited, edited[0], approved);
        expect(decision).toBe("apply-recheck");
        expect(narrativeOverlayApplies(decision)).toBe(true);
    });
    it("ignores edits outside the approved sentence's field group", () => {
        const approved = snapshot(record());
        const edited = record(approvedSource, neighbourSource, "Its effects are documented in one report.");
        expect(narrativeOverlayDecision("article", edited, edited[0], approved)).toBe("apply");
    });
    it("makes the approval stale when the approved sentence itself changes", () => {
        const approved = snapshot(record());
        const edited = record("2-Benzylpiperidine is a weak stimulant of the piperidine class.");
        const decision = narrativeOverlayDecision("article", edited, edited[0], approved);
        expect(decision).toBe("stale");
        expect(narrativeOverlayApplies(decision)).toBe(false);
    });
    it("makes the approval stale when it belongs to another field", () => {
        const segments = record();
        const moved = JSON.stringify({ ...JSON.parse(snapshot(segments).context), field: "notes.1" });
        expect(narrativeOverlayDecision("article", segments, segments[0], snapshot(segments, moved))).toBe("stale");
    });
    it("keeps the whole-group rule for approvals stored in the old context shape", () => {
        const original = record();
        const legacy = snapshot(original, legacyNarrativeContext("article", original[0], narrativeFieldVersion(original, original[0])));
        expect(narrativeOverlayDecision("article", original, original[0], legacy)).toBe("apply");
        const neighbourEdit = record(approvedSource, "It is structurally related to methylphenidate and other phenidates.");
        expect(narrativeOverlayDecision("article", neighbourEdit, neighbourEdit[0], legacy)).toBe("stale");
        const outsideEdit = record(approvedSource, neighbourSource, "Its effects are documented in one report.");
        expect(narrativeOverlayDecision("article", outsideEdit, outsideEdit[0], legacy)).toBe("apply");
    });
});
