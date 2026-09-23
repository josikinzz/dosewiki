import { describe, expect, it } from "vitest";
import {
  PUBLICATION_OUTBOX_LEASE_MS,
  PUBLICATION_OUTBOX_MAX_ATTEMPTS,
  deliverDuePublications,
  publicationOutboxKey,
  type PublicationTransport,
  type TranslationIntentQueue,
} from "./publicationOutbox";
import { createInMemoryPublicationOutbox } from "./publicationOutbox.memory";
import type { PublicationReceipt } from "./publicationDispatch";
import type { PublicationTarget } from "./publicationWire";

const accepted: PublicationReceipt = { target: "https://dose.wiki", status: "accepted", attempts: 1, verification: "verified" };
const unreachable: PublicationReceipt = { target: "https://dose.wiki", status: "unreachable", attempts: 1 };

function harness(options: { dispatch?: (targets: readonly PublicationTarget[]) => PublicationReceipt[] | Promise<PublicationReceipt[]> } = {}) {
  let now = Date.UTC(2026, 8, 23, 12);
  const outbox = createInMemoryPublicationOutbox({ now: () => now });
  const dispatched: PublicationTarget[][] = [];
  const translationRequests: string[] = [];
  const transport: PublicationTransport = {
    dispatch: async (targets) => {
      dispatched.push([...targets]);
      return options.dispatch ? options.dispatch(targets) : [accepted];
    },
  };
  const translations: TranslationIntentQueue = {
    enqueue: async (jobSlug, row) => {
      translationRequests.push(jobSlug);
      outbox.recordTranslationIntent(row._id, row.generation);
    },
  };
  return {
    outbox,
    dispatched,
    translationRequests,
    advance: (ms: number) => { now += ms; },
    deliver: () => deliverDuePublications({ store: outbox.store, transport, translations }),
    row: (target: PublicationTarget) => outbox.rows().find((row) => row.key === publicationOutboxKey(target)),
  };
}

describe("publication outbox identity", () => {
  it("names an article by slug alone so a dependency change coalesces into one row", () => {
    expect(publicationOutboxKey({ kind: "article", slug: "lsd", dependency: "detail" }))
      .toBe(publicationOutboxKey({ kind: "article", slug: "lsd", dependency: "membership" }));
    expect(publicationOutboxKey({ kind: "article-translation", slug: "lsd", locale: "zh-Hans" }))
      .not.toBe(publicationOutboxKey({ kind: "article-translation", slug: "lsd", locale: "ru" }));
  });

  it("coalesces repeated commits into one pending row with the broadest dependency", () => {
    const h = harness();
    h.outbox.enqueue([{ target: { kind: "article", slug: "lsd", dependency: "membership" }, revision: "r1" }], "editorial");
    h.outbox.enqueue([{ target: { kind: "article", slug: "lsd", dependency: "detail" }, revision: "r2" }], "editorial");
    expect(h.outbox.rows()).toHaveLength(1);
    expect(h.row({ kind: "article", slug: "lsd" })).toMatchObject({
      generation: 2, pending: true, revision: "r2", target: { dependency: "membership" },
    });
  });
});

describe("delivering editorial commits", () => {
  it("creates durable translation intent before dispatch and settles the row on acceptance", async () => {
    const h = harness();
    h.outbox.enqueue([{ target: { kind: "effect", slug: "drifting" } }], "editorial");
    expect(await h.deliver()).toEqual({ claimed: 1, completed: 1, retried: 0, skipped: 0 });
    expect(h.translationRequests).toEqual(["effect/drifting"]);
    expect(h.dispatched).toEqual([[{ kind: "effect", slug: "drifting" }]]);
    expect(h.row({ kind: "effect", slug: "drifting" })).toMatchObject({ pending: false, attempts: 1 });
    expect(await h.deliver()).toMatchObject({ claimed: 0 });
  });

  it("keeps a row pending without dispatch when translation intent cannot be recorded", async () => {
    const h = harness();
    h.outbox.enqueue([{ target: { kind: "report", slug: "first" } }], "editorial");
    const run = await deliverDuePublications({
      store: h.outbox.store,
      transport: { dispatch: async () => { throw new Error("must not dispatch"); } },
      translations: { enqueue: async () => { throw new Error("queue unavailable"); } },
    });
    expect(run).toMatchObject({ completed: 0, retried: 1 });
    expect(h.row({ kind: "report", slug: "first" })).toMatchObject({ pending: true });
  });
});

describe("delivering translation completions", () => {
  it("dispatches without asking for more translation work", async () => {
    const h = harness();
    h.outbox.enqueue([{ target: { kind: "contributor", slug: "josie" } }, { target: { kind: "about" } }], "translation");
    expect(await h.deliver()).toMatchObject({ claimed: 2, completed: 2 });
    expect(h.translationRequests).toEqual([]);
    expect(h.dispatched.flat()).toEqual(expect.arrayContaining([{ kind: "contributor", slug: "josie" }, { kind: "about" }]));
  });

  it("does not swallow an editorial commit that still needs translation intent", async () => {
    const h = harness();
    h.outbox.enqueue([{ target: { kind: "contributor", slug: "josie" } }], "editorial");
    h.outbox.enqueue([{ target: { kind: "contributor", slug: "josie" } }], "translation");
    await h.deliver();
    expect(h.translationRequests).toEqual(["profile/josie"]);
  });

  it("shares one retry schedule, dead letter, and re-pend with editorial rows", async () => {
    const h = harness({ dispatch: () => [unreachable] });
    const target: PublicationTarget = { kind: "article-translation", slug: "lsd", locale: "zh-Hans" };
    h.outbox.enqueue([{ target }], "translation");
    for (let cycle = 1; cycle <= PUBLICATION_OUTBOX_MAX_ATTEMPTS; cycle += 1) {
      expect(await h.deliver()).toMatchObject({ claimed: 1, retried: 1 });
      expect(await h.deliver()).toMatchObject({ claimed: 0 });
      h.advance(60 * 60 * 1000);
    }
    expect(h.row(target)).toMatchObject({ pending: false, attempts: PUBLICATION_OUTBOX_MAX_ATTEMPTS, deadLetteredAt: expect.any(Number) });
    expect(await h.deliver()).toMatchObject({ claimed: 0 });

    h.outbox.enqueue([{ target }], "translation");
    expect(h.row(target)).toMatchObject({ pending: true, attempts: 0, deadLetteredAt: undefined });
    expect(await h.deliver()).toMatchObject({ claimed: 1 });
  });
});

describe("leases and generations", () => {
  it("makes a claimed row due again after its lease when no receipt arrives", async () => {
    const h = harness();
    h.outbox.enqueue([{ target: { kind: "changelog" } }], "editorial");
    expect(await h.outbox.store.claimDue()).toHaveLength(1);
    expect(await h.outbox.store.claimDue()).toEqual([]);
    h.advance(PUBLICATION_OUTBOX_LEASE_MS);
    expect(await h.outbox.store.claimDue()).toEqual([expect.objectContaining({ attempts: 2 })]);
  });

  it("ignores a late receipt for an older generation", async () => {
    const h = harness();
    h.outbox.enqueue([{ target: { kind: "copy" } }], "editorial");
    const [claimed] = await h.outbox.store.claimDue();
    h.outbox.enqueue([{ target: { kind: "copy" } }], "editorial");
    await h.outbox.store.recordDelivery({ id: claimed._id, generation: claimed.generation, complete: true, receipts: [accepted] });
    expect(h.row({ kind: "copy" })).toMatchObject({ pending: true, generation: 2 });
  });

  it("claims never-attempted rows ahead of failing retries", async () => {
    const h = harness({ dispatch: (targets) => targets[0].kind === "about" ? [accepted] : [unreachable] });
    const failing = Array.from({ length: 18 }, (_, index) => ({ target: { kind: "report" as const, slug: `r${index}` } }));
    h.outbox.enqueue(failing, "translation");
    await h.deliver();
    h.advance(60 * 60 * 1000);
    h.outbox.enqueue([{ target: { kind: "about" } }], "translation");
    await h.deliver();
    expect(h.row({ kind: "about" })).toMatchObject({ pending: false });
  });

  it("dead-letters a stored target that is not a publication identity", async () => {
    const h = harness();
    h.outbox.enqueue([{ target: { kind: "not-a-target" } as unknown as PublicationTarget }], "editorial");
    expect(await h.deliver()).toMatchObject({ claimed: 1, skipped: 1 });
    expect(h.dispatched).toEqual([]);
    expect(h.outbox.rows()[0]).toMatchObject({ pending: false, deadLetteredAt: expect.any(Number) });
  });
});
