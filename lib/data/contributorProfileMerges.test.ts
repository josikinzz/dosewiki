import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@server/postgres/runtime/dataModel";
import type { MutationCtx, QueryCtx } from "@server/postgres/runtime/server";
import {
  applyProfileMergeHandler,
  assertProfileMergeInput,
  bindProfileMergeOperation,
  canonicalProfileMergeJson,
  plannedProfileMergeChanges,
  previewProfileMergeHandler,
  profileMergeReceiptHandler,
  profileMergeDigest,
  rollbackProfileMergeHandler,
} from "../../server/contributorProfileMerges";

const SOURCE = "kx72vtw19621c4kmbwjt0127558dhbvw" as Id<"contributorProfiles">;
const TARGET = "kx77dw7zwgzk9p8byv1b75ny958c9adm" as Id<"contributorProfiles">;
const DIGEST = "a".repeat(64);
const PHOSFORM_SOURCE = "kx720hr6135j0rb6mdm85r3mc18dgza9" as Id<"contributorProfiles">;
const PHOSFORM_TARGET = "kx78gb99p7e7p80q92rrsy5bas8c975b" as Id<"contributorProfiles">;
const TOKEN = "profile-merge-test-token";
const ACTOR = "editor@example.test";
const input = { source_profile_id: SOURCE, source_key: "WHERESSUEDE", target_profile_id: TARGET, target_key: "LOKA", pinned_snapshot_digest: "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d", pinned_snapshot_profile_count: 2119, expected_state_digest: DIGEST, applied_at: 1_788_225_000_000 };
const row = (id: string, value: Record<string, unknown>) => ({ _id: id, _creationTime: 1, ...value });
function captured(overrides: Record<string, unknown> = {}) {
  return { digest: DIGEST, state: {
    source: row(SOURCE, { key: "WHERESSUEDE", displayName: "wheressuede", aliases: [], links: [{ label: "Reddit", url: "https://www.reddit.com/user/wheressuede/" }], bio: "source bio", role: "Replication Artist", replicationOrder: ["old-work"], reportOrder: [], createdAt: "old", updatedAt: "old" }),
    target: row(TARGET, { key: "LOKA", displayName: "Loka", aliases: ["loka"], links: [], bio: "", role: "Replication Artist", replicationOrder: ["new-work"], reportOrder: [], createdAt: "new", updatedAt: "new" }),
    attributions: [row("attr", { poster_profile_id: SOURCE, creator_profile_id: SOURCE, poster_display_name: "wheressuede", creator_display_name: "wheressuede" })],
    sourceAliases: [row("alias", { profile_id: SOURCE, alias: "wheressuede" })], targetAliases: [],
    sourceAvatars: [row("avatar", { profile_id: SOURCE, media_digest: "b".repeat(64) })], targetAvatars: [],
    sourceBindings: [row("binding", { profile_id: SOURCE, profile_key: "WHERESSUEDE", artist_id: "wheressuede" })], targetBindings: [],
    sourceReports: [row("report", { subject: { name: "wheressuede", profile_key: "WHERESSUEDE" } })], targetReports: [],
    sourceVerification: row("sv", { profile_id: SOURCE, status: "verified", basis: "artist-sheet-review", work_count_reviewed: 3, rationale: "source", evidence: [], source_digest: "c".repeat(64), operation_id: "source-op" }),
    targetVerification: row("tv", { profile_id: TARGET, status: "unclear", basis: "editorial-review", work_count_reviewed: 2, rationale: "target", evidence: [], source_digest: "d".repeat(64), operation_id: "target-op" }),
    identityTokens: [row("token", { normalized_token: "wheressuede", owner_profile_ids: [SOURCE] })],
    ...overrides,
  } } as never;
}

type StoredRow = Record<string, unknown> & { _id: string; _creationTime: number };

function profileMergeContext(options: {
  sourceId?: Id<"contributorProfiles">;
  sourceKey?: string;
  targetId?: Id<"contributorProfiles">;
  targetKey?: string;
  sourceLinks?: Array<{ label: string; url: string }>;
  targetLinks?: Array<{ label: string; url: string }>;
} = {}) {
  const sourceId = options.sourceId ?? SOURCE;
  const sourceKey = options.sourceKey ?? "WHERESSUEDE";
  const targetId = options.targetId ?? TARGET;
  const targetKey = options.targetKey ?? "LOKA";
  const tables: Record<string, StoredRow[]> = {
    memberships: [row("membership", { email: ACTOR, role: "admin" })],
    contributorProfiles: [
      row(sourceId, {
        key: sourceKey,
        displayName: sourceKey.toLowerCase(),
        aliases: [],
        avatarUrl: "https://images.example.test/source.webp",
        bio: "source bio",
        role: "Replication Artist",
        links: options.sourceLinks ?? [{ label: "Reddit", url: "https://www.reddit.com/user/wheressuede/" }],
        replicationOrder: ["source-work"],
        reportOrder: [],
        createdAt: "source-created",
        updatedAt: "source-updated",
      }),
      row(targetId, {
        key: targetKey,
        displayName: targetKey,
        aliases: [targetKey.toLowerCase()],
        avatarUrl: "https://images.example.test/target.webp",
        bio: "target bio",
        role: "Replication Artist",
        links: options.targetLinks ?? [{ label: "Website", url: "https://target.example.test/" }],
        replicationOrder: ["target-work"],
        reportOrder: [],
        createdAt: "target-created",
        updatedAt: "target-updated",
      }),
    ],
    replicationIdentityAttributions: [row("attribution", {
      replication_id: "replication",
      poster_profile_id: sourceId,
      creator_profile_id: sourceId,
      poster_display_name: sourceKey.toLowerCase(),
      creator_display_name: sourceKey.toLowerCase(),
    })],
    contributorAliasEvidence: [row("alias", { profile_id: sourceId, alias: sourceKey.toLowerCase() })],
    contributorAvatarHistory: [row("avatar", { profile_id: sourceId, media_digest: "b".repeat(64) })],
    replicationIdentityProfileBindings: [row("binding", { profile_id: sourceId, profile_key: sourceKey, artist_id: sourceKey.toLowerCase() })],
    tripReports: [row("report", { slug: "report", subject: { name: sourceKey.toLowerCase(), profile_key: sourceKey } })],
    contributorReplicatorVerifications: [],
    contributorIdentityTokenSnapshots: [],
    contributorProfileMergeOperations: [],
    contributorProfileMergeItems: [],
  };
  let serial = 100;
  const writes: string[] = [];
  const fieldValue = (stored: StoredRow, field: string) => field.split(".").reduce<unknown>((value, part) =>
    value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, stored);
  const findById = (id: string) => Object.values(tables).flat().find((stored) => stored._id === id) ?? null;
  const query = (table: string) => ({
    withIndex: (_index: string, apply: (builder: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      const predicates: Array<[string, unknown]> = [];
      const builder = { eq(field: string, value: unknown) { predicates.push([field, value]); return builder; } };
      apply(builder);
      const matches = () => (tables[table] ?? []).filter((stored) => predicates.every(([field, value]) => fieldValue(stored, field) === value));
      return {
        unique: async () => {
          const found = matches();
          if (found.length > 1) throw new Error(`test query ${table} is not unique`);
          return found[0] ?? null;
        },
        take: async (count: number) => matches().slice(0, count),
      };
    },
  });
  const ctx = {
    auth: { getUserIdentity: async () => null },
    db: {
      get: vi.fn(async (id: string) => findById(id)),
      query,
      replace: vi.fn(async (id: string, value: Record<string, unknown>) => {
        const stored = findById(id);
        if (!stored) throw new Error(`missing test row ${id}`);
        const replacement = { _id: stored._id, _creationTime: stored._creationTime, ...value } as StoredRow;
        const rows = Object.values(tables).find((items) => items.includes(stored));
        if (!rows) throw new Error(`missing test table for ${id}`);
        rows[rows.indexOf(stored)] = replacement;
        writes.push(`replace:${id}`);
      }),
      insert: vi.fn(async (table: string, value: Record<string, unknown>) => {
        const id = `${table}-${serial++}`;
        (tables[table] ??= []).push({ _id: id, _creationTime: serial, ...value });
        writes.push(`insert:${table}`);
        return id;
      }),
      patch: vi.fn(async (id: string, value: Record<string, unknown>) => {
        const stored = findById(id);
        if (!stored) throw new Error(`missing test row ${id}`);
        for (const [key, item] of Object.entries(value)) {
          if (item === undefined) delete stored[key];
          else stored[key] = item;
        }
        writes.push(`patch:${id}`);
      }),
    },
  } as unknown as MutationCtx;
  const mergeInput = {
    source_profile_id: sourceId,
    source_key: sourceKey,
    target_profile_id: targetId,
    target_key: targetKey,
    pinned_snapshot_digest: "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d",
    pinned_snapshot_profile_count: 2119,
    expected_state_digest: "0".repeat(64),
    applied_at: 1_788_225_000_000,
  };
  return { ctx, tables, writes, input: mergeInput, findById };
}

describe("lossless contributor profile merges", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE;
  });

  it("accepts only the two immutable owner-approved pairs and leaves StingrayZ untouched", () => {
    expect(() => assertProfileMergeInput(input)).not.toThrow();
    expect(() => assertProfileMergeInput({ ...input, source_profile_id: "kx709vjddr2gpr2pyy7q0enstn8bc97h" as Id<"contributorProfiles">, source_key: "STINGRAYZ", target_key: "SYMMETRICVISION" })).toThrow(/not one of/);
    expect(() => assertProfileMergeInput({ ...input, target_profile_id: SOURCE })).toThrow(/not one of/);
  });

  it("preserves the source row, unions handles, links and work order, and retargets current work associations", async () => {
    const changes = bindProfileMergeOperation(await plannedProfileMergeChanges(input, captured()), "merge-loka");
    const target = changes.find((change) => change.rowId === TARGET)!.after as StoredRow;
    const source = changes.find((change) => change.rowId === SOURCE)!.after as StoredRow;
    expect(target.aliases).toEqual(["loka", "wheressuede"]);
    expect(target.links).toEqual([{ label: "Reddit", url: "https://www.reddit.com/user/wheressuede/" }]);
    expect(target.replicationOrder).toEqual(["new-work", "old-work"]);
    expect(source).toMatchObject({ key: "WHERESSUEDE", mergedIntoProfileId: TARGET, mergedIntoKey: "LOKA", mergedByOperationId: "merge-loka" });
    expect(changes.find((change) => change.rowId === "attr")!.after).toMatchObject({ poster_profile_id: TARGET, creator_profile_id: TARGET, poster_display_name: "wheressuede" });
    expect(changes.find((change) => change.rowId === "binding")!.after).toMatchObject({ profile_id: TARGET, profile_key: "LOKA", artist_id: "wheressuede" });
    expect(changes.find((change) => change.rowId === "report")!.after).toMatchObject({ subject: { name: "wheressuede", profile_key: "LOKA" } });
    expect(changes.some((change) => change.rowId === "alias" || change.rowId === "avatar" || change.rowId === "sv")).toBe(false);
  });

  it("aggregates verification without erasing either review contribution", async () => {
    const changes = bindProfileMergeOperation(await plannedProfileMergeChanges(input, captured()), "merge-loka");
    const verification = changes.find((change) => change.rowId === "tv")!.after as StoredRow;
    expect(verification).toMatchObject({ status: "verified", work_count_reviewed: 3, operation_id: "merge-loka" });
    expect(verification.review_contributions).toHaveLength(2);
    expect((verification.review_contributions as Array<{ artist_id: string }>).map((entry) => entry.artist_id)).toEqual(["profile:LOKA", "profile:WHERESSUEDE"]);
  });

  it("fails closed on membership ownership, third-party token ownership, and missing target verification", async () => {
    const baseline = captured() as unknown as {
      state: { source: StoredRow; target: StoredRow };
    };
    await expect(plannedProfileMergeChanges(input, captured({ source: { ...baseline.state.source, membershipEmail: "source@example.test" }, target: { ...baseline.state.target, membershipEmail: "target@example.test" } }))).rejects.toThrow(/membership owners/);
    await expect(plannedProfileMergeChanges(input, captured({ identityTokens: [row("token", { normalized_token: "wheressuede", owner_profile_ids: [SOURCE, "third"] })] }))).rejects.toThrow(/another owner/);
    await expect(plannedProfileMergeChanges(input, captured({ targetVerification: null }))).rejects.toThrow(/Target verification is absent/);
  });

  it("uses stable canonical digests independent of object key order", async () => {
    expect(canonicalProfileMergeJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(await profileMergeDigest({ b: 2, a: 1 })).toBe(await profileMergeDigest({ a: 1, b: 2 }));
  });

  it("applies through the authenticated mutation handler, receipts, replays, and rolls back every row exactly", async () => {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = TOKEN;
    const { ctx, tables, writes, input, findById } = profileMergeContext();
    const before = Object.fromEntries(["attribution", "binding", "report", SOURCE, TARGET].map((id) => [id, structuredClone(findById(id))]));
    const preview = await previewProfileMergeHandler(ctx as unknown as QueryCtx, { apiKey: TOKEN, actor_email: ACTOR, input });
    const reviewedInput = { ...input, expected_state_digest: preview.state_digest };
    const args = { apiKey: TOKEN, actor_email: ACTOR, operation_id: "merge-wheressuede-into-loka", dry_run: false, input: reviewedInput };

    await expect(applyProfileMergeHandler(ctx, { ...args, dry_run: true })).resolves.toMatchObject({ dry_run: true, idempotent_replay: false });
    expect(writes).toEqual([]);
    const applied = await applyProfileMergeHandler(ctx, args);
    expect(applied).toMatchObject({ dry_run: false, idempotent_replay: false });
    expect(findById(SOURCE)).toMatchObject({ mergedIntoProfileId: TARGET, mergedIntoKey: "LOKA", mergedByOperationId: args.operation_id });
    expect(findById("attribution")).toMatchObject({ poster_profile_id: TARGET, creator_profile_id: TARGET, poster_display_name: "wheressuede" });
    expect(findById("binding")).toMatchObject({ profile_id: TARGET, profile_key: "LOKA", artist_id: "wheressuede" });
    expect(findById("report")).toMatchObject({ subject: { name: "wheressuede", profile_key: "LOKA" } });
    expect(tables.contributorAliasEvidence).toHaveLength(1);
    expect(tables.contributorAvatarHistory).toHaveLength(1);

    const receipt = await profileMergeReceiptHandler(ctx as unknown as QueryCtx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: args.operation_id });
    expect(receipt).toMatchObject({ live_matches: true, checked_items: applied.item_count, operation: { status: "applied" } });
    expect(receipt?.operation).not.toHaveProperty("_id");
    expect(receipt?.operation).not.toHaveProperty("_creationTime");
    await expect(applyProfileMergeHandler(ctx, args)).resolves.toMatchObject({ idempotent_replay: true, item_count: applied.item_count });
    await expect(rollbackProfileMergeHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: args.operation_id, rollback_of: args.operation_id, dry_run: false })).rejects.toThrow(/rollback operation ID collision/);

    const rollbackArgs = { apiKey: TOKEN, actor_email: ACTOR, operation_id: "rollback-wheressuede-into-loka", rollback_of: args.operation_id, dry_run: false };
    const writesBeforeDryRun = writes.length;
    await expect(rollbackProfileMergeHandler(ctx, { ...rollbackArgs, dry_run: true })).resolves.toMatchObject({ dry_run: true, idempotent_replay: false });
    expect(writes).toHaveLength(writesBeforeDryRun);
    await expect(rollbackProfileMergeHandler(ctx, rollbackArgs)).resolves.toMatchObject({ dry_run: false, idempotent_replay: false });
    for (const [id, expected] of Object.entries(before)) expect(findById(id)).toEqual(expected);
    await expect(profileMergeReceiptHandler(ctx as unknown as QueryCtx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: args.operation_id })).resolves.toMatchObject({ live_matches: true, checked_items: applied.item_count, operation: { status: "rolled-back", rollback_operation_id: rollbackArgs.operation_id } });
    await expect(rollbackProfileMergeHandler(ctx, rollbackArgs)).resolves.toMatchObject({ idempotent_replay: true });
  });

  it("rejects state drift before apply and after apply without weakening the journal CAS", async () => {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = TOKEN;
    const first = profileMergeContext();
    const preview = await previewProfileMergeHandler(first.ctx as unknown as QueryCtx, { apiKey: TOKEN, actor_email: ACTOR, input: first.input });
    (first.findById(TARGET) as StoredRow).bio = "concurrent edit";
    await expect(applyProfileMergeHandler(first.ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "merge-drift-before", dry_run: false, input: { ...first.input, expected_state_digest: preview.state_digest } })).rejects.toThrow(/current-state digest drifted/);
    expect(first.tables.contributorProfileMergeOperations).toHaveLength(0);

    const second = profileMergeContext();
    const secondPreview = await previewProfileMergeHandler(second.ctx as unknown as QueryCtx, { apiKey: TOKEN, actor_email: ACTOR, input: second.input });
    const args = { apiKey: TOKEN, actor_email: ACTOR, operation_id: "merge-drift-after", dry_run: false, input: { ...second.input, expected_state_digest: secondPreview.state_digest } };
    await applyProfileMergeHandler(second.ctx, args);
    (second.findById(TARGET) as StoredRow).bio = "post-merge concurrent edit";
    await expect(applyProfileMergeHandler(second.ctx, args)).rejects.toThrow(/after CAS failed/);
    await expect(profileMergeReceiptHandler(second.ctx as unknown as QueryCtx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: args.operation_id })).resolves.toMatchObject({ live_matches: false });
    await expect(rollbackProfileMergeHandler(second.ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "rollback-drifted", rollback_of: args.operation_id, dry_run: false })).rejects.toThrow(/after CAS failed/);
  });

  it("preserves PHOSFORM's existing three links and appends WOOODFIELD's fourth link", async () => {
    process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = TOKEN;
    const fixture = profileMergeContext({
      sourceId: PHOSFORM_SOURCE,
      sourceKey: "WOOODFIELD",
      targetId: PHOSFORM_TARGET,
      targetKey: "PHOSFORM",
      targetLinks: [
        { label: "Website", url: "https://phosform.example.test/" },
        { label: "Instagram", url: "https://instagram.com/phosform" },
        { label: "X", url: "https://x.com/phosform" },
      ],
      sourceLinks: [{ label: "Reddit", url: "https://www.reddit.com/user/wooodfield/" }],
    });
    const preview = await previewProfileMergeHandler(fixture.ctx as unknown as QueryCtx, { apiKey: TOKEN, actor_email: ACTOR, input: fixture.input });
    await applyProfileMergeHandler(fixture.ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "merge-wooodfield-into-phosform", dry_run: false, input: { ...fixture.input, expected_state_digest: preview.state_digest } });
    expect((fixture.findById(PHOSFORM_TARGET) as StoredRow).links).toEqual([
      { label: "Website", url: "https://phosform.example.test/" },
      { label: "Instagram", url: "https://instagram.com/phosform" },
      { label: "X", url: "https://x.com/phosform" },
      { label: "Reddit", url: "https://www.reddit.com/user/wooodfield/" },
    ]);
  });
});
