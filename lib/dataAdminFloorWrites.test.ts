import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveIndexLayoutHandler } from "../server/indexLayouts";
import { updateEditorialFieldsHandler } from "../server/lib/replicationStudio";
import {
  updateEffectSlugHandler,
  updateGalleryOrderHandler,
} from "../server/lib/replicationWrites";
import {
  saveSubstanceHandler,
  saveSubstancesHandler,
  setArticleFieldHandler,
  setIupacNameHandler,
} from "../server/lib/substanceWriteHandlers";
import { save as savePrompt } from "../server/prompts";
import { save as saveQuote } from "../server/quotes";
import { saveAboutHandler } from "../server/siteConfig";
import {
  setCarouselOrder,
  setDisabled,
  setReplicationDirectAssociation,
  setReplicationExclusions,
  upsert as upsertGallery,
} from "../server/substanceGalleries";

type Role = "admin" | "editor" | "contributor" | "viewer";

const MEMBERSHIPS: Record<string, Role> = {
  "admin@example.com": "admin",
  "editor@example.com": "editor",
  "contributor@example.com": "contributor",
};

/**
 * A ctx that resolves memberships and refuses every other table: the point of
 * each case below is that a sub-admin actor is turned away at the handler
 * seam before the handler reads or writes anything, whatever route called it.
 */
function createCtx() {
  const insert = vi.fn(async () => "new-id");
  const patch = vi.fn(async () => undefined);
  const remove = vi.fn(async () => undefined);
  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => null) },
    db: {
      insert,
      patch,
      delete: remove,
      get: vi.fn(async () => {
        throw new Error("unexpected db.get before authorization");
      }),
      query: vi.fn((table: string) => {
        if (table !== "memberships") {
          throw new Error(`unexpected read of ${table} before authorization`);
        }
        return {
          withIndex: (
            _index: string,
            selector: (query: { eq: (field: string, value: string) => unknown }) => unknown,
          ) => {
            let email = "";
            selector({
              eq: (_field, value) => {
                email = value;
                return {};
              },
            });
            return {
              unique: async () => {
                const role = MEMBERSHIPS[email];
                return role ? { email, role } : null;
              },
            };
          },
        };
      }),
    },
    storage: {
      generateUploadUrl: vi.fn(async () => {
        throw new Error("unexpected upload URL before authorization");
      }),
    },
  };
  return { ctx: ctx as never, insert, patch, remove };
}

function handlerOf(fn: unknown) {
  return (fn as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler;
}

const as = (actorEmail: string) => ({ apiKey: "secret", actorEmail });

const snapshot = {
  title: "Drifting",
  artist: "Someone",
  role: "replication",
  effect_slug: "drifting",
  credit_line: null,
  effect_tags: [],
};

/**
 * Every direct production write that used to sit on the editor floor. Each
 * entry names the handler and the arguments a real caller would send; the
 * actor is spliced in per case.
 */
const DIRECT_WRITES: Array<[string, (ctx: never, args: never) => Promise<unknown>, Record<string, unknown>]> = [
  ["saveSubstance", saveSubstanceHandler as never, { article: { id: 1, title: "LSD", slug: "lsd" } }],
  ["saveSubstances", saveSubstancesHandler as never, { articles: [{ id: 1, title: "LSD", slug: "lsd" }] }],
  ["setArticleField", setArticleFieldHandler as never, { slug: "lsd", path: "title", value: "x", expected: "y", baseHash: "loaded-revision", changeId: "field-change" }],
  ["setIupacName", setIupacNameHandler as never, { slug: "lsd", value: "x", expected: "y" }],
  ["indexLayouts.save", saveIndexLayoutHandler as never, { type: "psychoactive", version: 1, categories: [] }],
  ["siteConfig.saveAbout", saveAboutHandler as never, { aboutMarkdown: "# About" }],
  ["prompts.save", handlerOf(savePrompt), { key: "section_summary", content: "Prompt" }],
  ["quotes.save", handlerOf(saveQuote), { slug: "lsd", section: "subjective_effects", content: "Quote" }],
  ["replications.updateGalleryOrder", updateGalleryOrderHandler as never, { effect_slug: "drifting", replication_slugs: [] }],
  ["replications.updateEffectSlug", updateEffectSlugHandler as never, { slug: "drifting-1", effect_slug: "drifting" }],
  [
    "replications.updateEditorialFields",
    updateEditorialFieldsHandler as never,
    { id: "replication-id", expected: snapshot, updates: snapshot },
  ],
  [
    "substanceGalleries.upsert",
    handlerOf(upsertGallery),
    { substance_slug: "lsd", curated_slugs: [], removed_slugs: [] },
  ],
  ["substanceGalleries.setCarouselOrder", handlerOf(setCarouselOrder), { substance_slug: "lsd", carousel_order: [] }],
  ["substanceGalleries.setDisabled", handlerOf(setDisabled), { substance_slug: "lsd", disabled: true, expectedRevision: "a".repeat(64) }],
  [
    "substanceGalleries.setReplicationDirectAssociation",
    handlerOf(setReplicationDirectAssociation),
    { replicationSlug: "drifting-1", substanceSlug: "lsd", assigned: true },
  ],
  [
    "substanceGalleries.setReplicationExclusions",
    handlerOf(setReplicationExclusions),
    { replicationSlug: "drifting-1", excludedSubstanceSlugs: [] },
  ],
];

describe("direct production writes sit on the admin floor", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = "secret";
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  for (const [label, handler, args] of DIRECT_WRITES) {
    it(`${label} refuses an editor and a contributor before touching any table`, async () => {
      for (const actorEmail of ["editor@example.com", "contributor@example.com"]) {
        const { ctx, insert, patch, remove } = createCtx();

        await expect(handler(ctx, { ...args, ...as(actorEmail) } as never)).rejects.toThrow(
          "Admin access required",
        );

        expect(insert).not.toHaveBeenCalled();
        expect(patch).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
      }
    });
  }

  it("admits an admin past the floor (the ctx refuses the very next read)", async () => {
    // Proves the refusals above are the floor and not the ctx: an admin gets
    // past requireRole and fails only on this ctx's deliberately hostile db.
    const { ctx } = createCtx();

    await expect(
      setArticleFieldHandler(ctx, { ...as("admin@example.com"), slug: "lsd", path: "title", value: "x", expected: "y", baseHash: "loaded-revision", changeId: "field-change" }),
    ).rejects.toThrow("unexpected read of substanceIndex before authorization");
  });
});

describe("siteConfig.saveAbout audit stamp", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = "secret";
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  function aboutCtx() {
    const insert = vi.fn(async (_table: string, _document: Record<string, unknown>) => "about-id");
    const ctx = {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        insert,
        patch: vi.fn(),
        query: vi.fn((table: string) => ({
          withIndex: (
            _index: string,
            selector: (query: { eq: (field: string, value: string) => unknown }) => unknown,
          ) => {
            if (table === "contentRevisions") return { order: () => ({ first: async () => null }) };
            let key = "";
            selector({
              eq: (_field, value) => {
                key = value;
                return {};
              },
            });
            if (table === "memberships") {
              const role = MEMBERSHIPS[key];
              return { unique: async () => (role ? { email: key, role } : null) };
            }
            return { first: async () => null };
          },
        })),
      },
    };
    return { ctx: ctx as never, insert };
  }

  it("stamps the approver by default and lets an admin attribute the write to someone else", async () => {
    const plain = aboutCtx();
    await saveAboutHandler(plain.ctx, { ...as("admin@example.com"), aboutMarkdown: "# About" });
    expect(plain.insert.mock.calls[0]?.[1]).toMatchObject({ updatedBy: "admin@example.com" });

    const attributed = aboutCtx();
    await saveAboutHandler(attributed.ctx, {
      ...as("admin@example.com"),
      aboutMarkdown: "# About",
      updatedBy: "approver@example.com",
    });
    expect(attributed.insert.mock.calls[0]?.[1]).toMatchObject({ updatedBy: "approver@example.com" });
  });
});
