 
import { afterEach, describe, expect, it, vi } from "vitest";

import { compareAndSetEffectTaxonomyHandler } from "../../../server/lib/replicationTaxonomyCas";

const originalScopedToken = process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE;
const originalLegacyToken = process.env.DATA_ADMIN_KEY;

afterEach(() => {
  if (originalScopedToken === undefined) {
    delete process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE;
  } else {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = originalScopedToken;
  }
  if (originalLegacyToken === undefined) {
    delete process.env.DATA_ADMIN_KEY;
  } else {
    process.env.DATA_ADMIN_KEY = originalLegacyToken;
  }
});

function row() {
  return {
    _id: "k575hx9hey1ra998vhy6xx98ds8465d7",
    _creationTime: 1,
    slug: "untitled-salviadroid-2",
    title: "Untitled",
    artist: "SalviaDroid",
    type: "image" as const,
    storage_id: "kg26the70kcs7yanzc1b3a1gwd8c8n42",
    r2_key: "media/sha256/7c/example.jpg",
    format: "jpg",
    created_at: "2026-01-01T00:00:00Z",
    effect_slug: "immersive-hallucinations",
    effect_tags: [],
    replication_status: "replication" as const,
    taxonomy_record_key: "legacy:k575hx9hey1ra998vhy6xx98ds8465d7",
    taxonomy_source_digest: "a".repeat(64),
    taxonomy_version: 2,
    taxonomy_updated_at: 123,
  };
}

function args() {
  const current = row();
  return {
    apiKey: "scoped-secret",
    id: current._id,
    expected: {
      identity: {
        _id: current._id,
        slug: current.slug,
        title: current.title,
        artist: current.artist,
        type: current.type,
        storage_id: current.storage_id,
        r2_key: current.r2_key,
      },
      value: {
        effect_slug: current.effect_slug,
        effect_tags: current.effect_tags,
        replication_status: current.replication_status,
        taxonomy_record_key: current.taxonomy_record_key,
        taxonomy_source_digest: current.taxonomy_source_digest,
        taxonomy_version: current.taxonomy_version,
        taxonomy_updated_at: current.taxonomy_updated_at,
      },
    },
    intended: {
      effect_slug: "internal-hallucination",
      effect_tags: ["autonomous-entity"],
    },
  };
}

function context(stored = row()) {
  const effects = new Set(["internal-hallucination", "autonomous-entity"]);
  const patch = vi.fn();
  return {
    patch,
    ctx: {
      db: {
        get: vi.fn().mockResolvedValue(stored),
        patch,
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockImplementation((_name, select) => {
            let selected = "";
            select({ eq: (_field: string, slug: string) => { selected = slug; } });
            return { first: vi.fn().mockResolvedValue(effects.has(selected) ? { slug: selected } : null) };
          }),
        }),
      },
    },
  };
}

describe("replication taxonomy compare-and-set mutation", () => {
  it("requires the scoped maintenance token and patches only after the full snapshot matches", async () => {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = "scoped-secret";
    const { ctx, patch } = context();

    const result = await compareAndSetEffectTaxonomyHandler(ctx as never, args() as never);

    expect(patch).toHaveBeenCalledWith("k575hx9hey1ra998vhy6xx98ds8465d7", {
      effect_slug: "internal-hallucination",
      effect_tags: ["autonomous-entity"],
    });
    expect(result).toEqual({
      success: true,
      id: "k575hx9hey1ra998vhy6xx98ds8465d7",
      slug: "untitled-salviadroid-2",
      effect_slug: "internal-hallucination",
      effect_tags: ["autonomous-entity"],
    });
  });

  it("rejects identity or current-value drift without patching", async () => {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = "scoped-secret";
    const changed = { ...row(), taxonomy_version: 3 };
    const { ctx, patch } = context(changed);

    await expect(compareAndSetEffectTaxonomyHandler(ctx as never, args() as never))
      .rejects.toThrow(/precondition failed/i);
    expect(patch).not.toHaveBeenCalled();
  });

  it("accepts an exact snapshot regardless of object key serialization order", async () => {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = "scoped-secret";
    const input = args();
    input.expected = {
      value: {
        taxonomy_updated_at: input.expected.value.taxonomy_updated_at,
        taxonomy_version: input.expected.value.taxonomy_version,
        taxonomy_source_digest: input.expected.value.taxonomy_source_digest,
        taxonomy_record_key: input.expected.value.taxonomy_record_key,
        replication_status: input.expected.value.replication_status,
        effect_tags: input.expected.value.effect_tags,
        effect_slug: input.expected.value.effect_slug,
      },
      identity: {
        r2_key: input.expected.identity.r2_key,
        storage_id: input.expected.identity.storage_id,
        type: input.expected.identity.type,
        artist: input.expected.identity.artist,
        title: input.expected.identity.title,
        slug: input.expected.identity.slug,
        _id: input.expected.identity._id,
      },
    };
    const { ctx, patch } = context();

    await expect(compareAndSetEffectTaxonomyHandler(ctx as never, input as never))
      .resolves.toMatchObject({ success: true });
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("rejects the broad legacy key even when it is configured", async () => {
    delete process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE;
    process.env.DATA_ADMIN_KEY = "legacy-secret";
    const { ctx, patch } = context();
    const legacyArgs = { ...args(), apiKey: "legacy-secret" };

    await expect(compareAndSetEffectTaxonomyHandler(ctx as never, legacyArgs as never))
      .rejects.toThrow(/scoped replicationMaintenance/i);
    expect(patch).not.toHaveBeenCalled();
  });
});
