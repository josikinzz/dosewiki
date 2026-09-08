import { describe, expect, it } from "vitest";

import {
  PUBLICATION_SIGNAL_MAX_TARGETS,
  PUBLICATION_SIGNAL_MAX_SKEW_MS,
  PUBLICATION_SIGNAL_VERSION,
  parsePublicationSignal,
  type PublicationTarget,
} from "./publicationWire";
import { publicationTargetForSavedPath, resolvePublicationEffects } from "./publicCacheContract";

function signalBody(overrides: Record<string, unknown> = {}) {
  return {
    version: PUBLICATION_SIGNAL_VERSION,
    source: "save-to-convex",
    issuedAt: Date.now(),
    dispatchId: "abcd1234",
    targets: [{ kind: "article", slug: "2c-b" }],
    ...overrides,
  };
}

describe("publication targets", () => {
  it("expires an article's own leaves, its gallery, its history and the shared listings", () => {
    const effect = resolvePublicationEffects([{ kind: "article", slug: "2c-b" }]);

    expect(effect.paths).toEqual([{ path: "/2c-b" }]);
    expect(effect.tags).toEqual([
      "convex-public:substances:2c-b",
      "convex-public:replications:substance:2c-b",
      "convex-public:changelog:article:2c-b",
      "convex-public:substance-lists",
      "convex-public:changelog-lists",
    ]);
  });

  it("does not expire an unrelated article when one is published", () => {
    const effect = resolvePublicationEffects([{ kind: "article", slug: "2c-b" }]);

    expect(effect.tags).not.toContain("convex-public:substances:lsd");
    expect(effect.tags).not.toContain("convex-public");
  });

  it("routes a class depiction to its class page and a substance depiction to its article", () => {
    expect(resolvePublicationEffects([{ kind: "molecule", slug: "class:tryptamines" }]).paths).toEqual([
      { path: "/chemical-classes/tryptamines" },
    ]);
    expect(resolvePublicationEffects([{ kind: "molecule", slug: "lsd" }]).paths).toEqual([
      { path: "/lsd" },
    ]);
  });

  it("deduplicates the union of overlapping targets", () => {
    const effect = resolvePublicationEffects([
      { kind: "article", slug: "lsd" },
      { kind: "article", slug: "lsd" },
      { kind: "substance-lists" },
    ]);

    expect(effect.paths).toEqual([{ path: "/lsd" }, { path: "/substances" }]);
    expect(effect.tags.filter((tag) => tag === "convex-public:substance-lists")).toHaveLength(1);
  });

  it("translates the saved-path vocabulary and refuses paths it cannot name", () => {
    expect(publicationTargetForSavedPath("/2c-b")).toEqual({ kind: "article", slug: "2c-b" });
    expect(publicationTargetForSavedPath("/effects/euphoria")).toEqual({ kind: "effect", slug: "euphoria" });
    expect(publicationTargetForSavedPath("/copy-blocks")).toEqual({ kind: "copy" });
    expect(publicationTargetForSavedPath("/api/replications/showcase")).toEqual({
      kind: "replication-collections",
    });
    expect(publicationTargetForSavedPath("/2c-b?draft=1")).toBeNull();
    expect(publicationTargetForSavedPath("/dev/tools")).toBeNull();
  });
});

describe("received publication signals", () => {
  it("accepts a well-formed signal", () => {
    const parsed = parsePublicationSignal(signalBody());

    expect(parsed.status).toBe("accepted");
  });

  it("refuses a target kind it cannot map instead of expiring everything", () => {
    const parsed = parsePublicationSignal(signalBody({ targets: [{ kind: "everything" }] }));

    expect(parsed).toEqual({ status: "refused", reason: "unknown_target" });
  });

  it("refuses a slug carrying path or tag syntax", () => {
    for (const slug of ["../admin", "2c-b/../lsd", "A2", "", "lsd?v=1", "lsd:tag"]) {
      expect(parsePublicationSignal(signalBody({ targets: [{ kind: "article", slug }] }))).toEqual({
        status: "refused",
        reason: "unknown_target",
      });
    }
  });

  it("keeps a tag-shaped slug scoped to its own article tag", () => {
    // A slug is never concatenated into a caller-chosen tag: the receiver
    // derives the tag itself, so an awkward slug cannot reach the global tag.
    const parsed = parsePublicationSignal(signalBody({ targets: [{ kind: "article", slug: "convex-public" }] }));

    expect(parsed.status).toBe("accepted");
    expect(resolvePublicationEffects(parsed.status === "accepted" ? parsed.signal.targets : []).tags).not.toContain(
      "convex-public",
    );
  });

  it("refuses a keyed kind with no key and an unkeyed kind carrying one", () => {
    expect(parsePublicationSignal(signalBody({ targets: [{ kind: "article" }] })).status).toBe("refused");
    expect(
      parsePublicationSignal(signalBody({ targets: [{ kind: "about", slug: "lsd" }] })).status,
    ).toBe("refused");
  });

  it("refuses a replayed capture outside the skew window", () => {
    const issuedAt = Date.now() - PUBLICATION_SIGNAL_MAX_SKEW_MS - 1_000;

    expect(parsePublicationSignal(signalBody({ issuedAt }))).toEqual({
      status: "refused",
      reason: "stale_signal",
    });
  });

  it("refuses an unbounded sweep", () => {
    const targets: PublicationTarget[] = Array.from(
      { length: PUBLICATION_SIGNAL_MAX_TARGETS + 1 },
      (_, index) => ({ kind: "article", slug: `article-${index}` }),
    );

    expect(parsePublicationSignal(signalBody({ targets }))).toEqual({
      status: "refused",
      reason: "too_many_targets",
    });
  });

  it("refuses an empty, unversioned or unknown-source signal", () => {
    expect(parsePublicationSignal(signalBody({ targets: [] })).status).toBe("refused");
    expect(parsePublicationSignal(signalBody({ version: 2 })).status).toBe("refused");
    expect(parsePublicationSignal(signalBody({ source: "anonymous" })).status).toBe("refused");
    expect(parsePublicationSignal(signalBody({ dispatchId: "short" })).status).toBe("refused");
  });
});
