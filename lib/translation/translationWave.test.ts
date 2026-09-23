import { describe, expect, it, vi } from "vitest";
import type { WorkUnit } from "../../scripts/translation/engine.mjs";
import type { TranslationSegmentRow } from "./segmentStore";

vi.mock("server-only", () => ({}));
vi.mock("./segmentStore", () => ({ writeTranslations: async () => { throw new Error("tests inject a writer"); } }));

import { createTranslationWave } from "./translationWave";

const unit = (hash: string): WorkUnit => ({
  hash, source: `Segment ${hash}.`, contextClass: "prose", group: "body", markup: false, words: 2, occurrences: 1, contextKind: "article",
});
const row = (hash: string, promptVersion = "v1", locale = "es"): TranslationSegmentRow => ({
  locale, hash, source: `Segment ${hash}.`, target: `es:${hash}`, model: "fixture", prompt_version: promptVersion,
});
const hashes = (units: readonly WorkUnit[]) => units.map(({ hash }) => hash);

function recordingWriter() {
  const writes: string[][] = [];
  return { writes, write: async (rows: readonly TranslationSegmentRow[]) => { writes.push(rows.map(({ hash }) => hash)); } };
}

describe("translation wave", () => {
  it("shares a segment only between claims with the same locale and prompt version", () => {
    const wave = createTranslationWave({ write: recordingWriter().write });
    const first = wave.claim("es", "v1", [unit("shared"), unit("first")]);
    const samePrompt = wave.claim("es", "v1", [unit("shared"), unit("second")]);
    const newerPrompt = wave.claim("es", "v2", [unit("shared")]);
    const otherLocale = wave.claim("fr", "v1", [unit("shared")]);

    expect(hashes(first.owned)).toEqual(["shared", "first"]);
    expect(hashes(samePrompt.owned)).toEqual(["second"]);
    expect(hashes(newerPrompt.owned)).toEqual(["shared"]);
    expect(hashes(otherLocale.owned)).toEqual(["shared"]);
  });

  it("reports a shared segment as the owning claim settled it", async () => {
    const wave = createTranslationWave({ write: recordingWriter().write });
    const owner = wave.claim("es", "v1", [unit("kept"), unit("blocked")]);
    const sharer = wave.claim("es", "v1", [unit("kept"), unit("blocked")]);
    const outcome = sharer.shared();

    await owner.settle([row("kept")], [{ hash: "blocked", defects: ["length"] }]);

    expect(await outcome).toEqual({ stored: 1, rejected: [{ hash: "blocked", defects: ["length"] }] });
    expect(await owner.shared()).toEqual({ stored: 0, rejected: [] });
  });

  it("fails a sharer with the owner's write failure and throws it to the owner", async () => {
    const wave = createTranslationWave({ write: async () => { throw new Error("lock timeout"); } });
    const owner = wave.claim("es", "v1", [unit("shared")]);
    const sharer = wave.claim("es", "v1", [unit("shared")]);

    await expect(owner.settle([row("shared")], [])).rejects.toThrow("lock timeout");
    await expect(sharer.shared()).rejects.toThrow("lock timeout");
  });

  it("fails only the segments an abandoned claim never settled", async () => {
    const wave = createTranslationWave({ write: recordingWriter().write });
    const owner = wave.claim("es", "v1", [unit("answered"), unit("unanswered")]);
    const answered = wave.claim("es", "v1", [unit("answered")]);
    const unanswered = wave.claim("es", "v1", [unit("unanswered")]);

    await owner.settle([row("answered")], []);
    owner.abandon(new Error("model unavailable"));

    expect(await answered.shared()).toEqual({ stored: 1, rejected: [] });
    await expect(unanswered.shared()).rejects.toThrow("model unavailable");
  });

  it("writes serially and coalesces rows queued behind a running write", async () => {
    const { writes, write } = recordingWriter();
    const wave = createTranslationWave({ write });
    const claims = ["a", "b", "c"].map((hash) => wave.claim("es", `v-${hash}`, [unit(hash), unit("dup")]));

    await Promise.all(claims.map((claim, index) => claim.settle([row(["a", "b", "c"][index]), row("dup", `v${index}`)], [])));

    expect(writes).toEqual([["a", "dup"], ["b", "dup", "c"]]);
  });
});
