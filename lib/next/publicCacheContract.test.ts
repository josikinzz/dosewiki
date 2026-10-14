import { describe, expect, it } from "vitest";

import {
  PUBLICATION_SIGNAL_MAX_TARGETS,
  PUBLICATION_SIGNAL_MAX_SKEW_MS,
  PUBLICATION_SIGNAL_VERSION,
  parsePublicationSignal,
  type PublicationTarget,
} from "./publicationWire";
import { resolvePublicationEffects } from "./publicCacheContract";

function signalBody(overrides: Record<string, unknown> = {}) {
  return {
    version: PUBLICATION_SIGNAL_VERSION,
    source: "save-article",
    issuedAt: Date.now(),
    dispatchId: "abcd1234",
    targets: [{ kind: "article", slug: "2c-b" }],
    ...overrides,
  };
}

describe("received publication signals", () => {
  it("accepts a well-formed signal", () => {
    const parsed = parsePublicationSignal(signalBody());

    expect(parsed.status).toBe("accepted");
  });

  it("refuses a target kind it cannot map instead of expiring everything", () => {
    const parsed = parsePublicationSignal(
      signalBody({ targets: [{ kind: "everything" }] }),
    );

    expect(parsed).toEqual({ status: "refused", reason: "unknown_target" });
  });

  it("refuses a slug carrying path or tag syntax", () => {
    for (const slug of [
      "../admin",
      "2c-b/../lsd",
      "A2",
      "",
      "lsd?v=1",
      "lsd:tag",
    ]) {
      expect(
        parsePublicationSignal(
          signalBody({ targets: [{ kind: "article", slug }] }),
        ),
      ).toEqual({
        status: "refused",
        reason: "unknown_target",
      });
    }
  });

  it("keeps a tag-shaped slug scoped to its own article tag", () => {
    // A slug is never concatenated into a caller-chosen tag: the receiver
    // derives the tag itself, so an awkward slug cannot reach the global tag.
    const parsed = parsePublicationSignal(
      signalBody({ targets: [{ kind: "article", slug: "data-public" }] }),
    );

    expect(parsed.status).toBe("accepted");
    expect(
      resolvePublicationEffects(
        parsed.status === "accepted" ? parsed.signal.targets : [],
      ).tags,
    ).not.toContain("data-public");
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
});
