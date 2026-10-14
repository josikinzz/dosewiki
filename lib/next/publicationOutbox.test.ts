import { describe, expect, it } from "vitest";
import {
  PUBLICATION_OUTBOX_LEASE_MS,
  deliverDuePublications,
  publicationOutboxKey,
  type PublicationTransport,
  type TranslationIntentQueue,
} from "./publicationOutbox";
import { createInMemoryPublicationOutbox } from "./publicationOutbox.memory";
import type { PublicationReceipt } from "./publicationDispatch";
import type { PublicationTarget } from "./publicationWire";

const accepted: PublicationReceipt = { target: "https://dose.wiki", status: "accepted", attempts: 1, verification: "verified" };

function harness() {
  let now = Date.UTC(2026, 8, 23, 12);
  const outbox = createInMemoryPublicationOutbox({ now: () => now });
  const translationRequests: string[] = [];
  const transport: PublicationTransport = {
    dispatch: async () => [accepted],
  };
  const translations: TranslationIntentQueue = {
    enqueue: async (jobSlug, row) => {
      translationRequests.push(jobSlug);
      outbox.recordTranslationIntent(row._id, row.generation);
    },
  };
  return {
    outbox,
    translationRequests,
    advance: (ms: number) => { now += ms; },
    deliver: () => deliverDuePublications({ store: outbox.store, transport, translations }),
    row: (target: PublicationTarget) => outbox.rows().find((row) => row.key === publicationOutboxKey(target)),
  };
}

describe("publication outbox identity", () => {
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
  it("does not swallow an editorial commit that still needs translation intent", async () => {
    const h = harness();
    h.outbox.enqueue([{ target: { kind: "contributor", slug: "josie" } }], "editorial");
    h.outbox.enqueue([{ target: { kind: "contributor", slug: "josie" } }], "translation");
    await h.deliver();
    expect(h.translationRequests).toEqual(["profile/josie"]);
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
});
