// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { NextRequest } from "next/server";
import { PostgresClient } from "@server/postgres/runtime/client";
import { ServerDataWriteClient } from "@server/data/serverWriteCapability";
import { api } from "@server/postgres/runtime/api";
import {
  PUBLIC_GLOSSARY_RENDERING_SELECT,
  publicGlossaryRendering,
} from "@server/translation/publicGlossaryRendering";
import { languageReadiness } from "@server/translation/languageReadiness";
import { renderingVersion } from "@/features/language-glossary/languageGlossary";
import { POST } from "./route";
import { GET } from "./visitorReaction";

vi.setConfig({ testTimeout: 30000 });

const seam = vi.hoisted(() => ({
  capability: null as unknown,
  limited: false,
  realLimits: false,
  client: null as unknown,
}));
vi.mock("@server/data/serverWriteCapability", async (original) => ({
  ...(await original<object>()),
  getPublicIntakeWriteCapability: () => seam.capability,
}));
vi.mock("@server/postgres/runtime/backend", () => ({
  getPostgresClient: () => seam.client,
}));
vi.mock("@server/http/nextRateLimit", async (original) => {
  const real = await original<typeof import("@server/http/nextRateLimit")>();
  return {
    getClientIp: () => "127.0.0.1",
    enforceRateLimit: async (
      request: Request,
      policy: Parameters<typeof real.enforceRateLimit>[1],
    ) =>
      seam.realLimits
        ? real.enforceRateLimit(request, policy)
        : seam.limited
          ? new Response("rate limited", { status: 429 })
          : null,
  };
});

let database: PGlite;
let client: PostgresClient;
const rendering = {
  term: "Calm",
  target: "Rust",
  kind: "effect-name",
  status: "draft" as const,
  updated_at: 1,
};
const visitor = randomUUID();
function request(body: Record<string, unknown>, origin = "https://dose.wiki") {
  return new NextRequest("https://dose.wiki/api/glossary-feedback", {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      cookie: `glossary-visitor=${visitor}`,
    },
    body: JSON.stringify({
      id: randomUUID(),
      locale: "nl",
      term: "Calm",
      version: renderingVersion(rendering),
      ...body,
    }),
  });
}
beforeAll(async () => {
  database = new PGlite();
  for (const filename of readdirSync("lib/postgres/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await database.exec(
      readFileSync(`lib/postgres/migrations/${filename}`, "utf8"),
    );
  // Adapt the pg transport only. The route, callable registry, transactions, SQL,
  // authorization, service allowlist, and persistence are production code.
  const connection = {
    query: async (sql: string, params?: unknown[]) => {
      if (!params?.length && sql.includes(";")) {
        const results = await database.exec(sql);
        const result = results[results.length - 1];
        return {
          rows: result?.rows ?? [],
          rowCount: result?.affectedRows ?? 0,
        };
      }
      const result = await database.query(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
    },
    release() {},
  };
  client = new PostgresClient({
    on() {},
    connect: async () => connection,
  } as unknown as Pool);
  await database.exec(`INSERT INTO "memberships" ("_id", "_creationTime", email, role, "glossaryLocales", "createdAt", "updatedAt") VALUES
    ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1, 'reviewer@example.test', 'translator', '["nl"]', 'now', 'now'),
    ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 1, 'other@example.test', 'translator', '["ar"]', 'now', 'now');`);
}, 30000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  vi.stubEnv("DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE", "test-intake");
  vi.stubEnv("DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE", "test-review");
  vi.stubEnv("SITE_FEEDBACK_IP_HASH_SECRET", "test-hash-secret");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.stubEnv("REPLICATION_MEDIA_BASE_URL", "https://media.example.test");
  seam.client = client;
  seam.capability = {
    apiKey: "test-intake",
    client: new ServerDataWriteClient(client),
  };
  seam.limited = false;
  seam.realLimits = false;
  await database.exec(
    'TRUNCATE "glossaryFeedback", "glossaryReactionEvents", "translationGlossary", "translationReviewEntries";',
  );
  await database.query(
    'INSERT INTO "translationGlossary" (locale, term, target, kind, status, source, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      "nl",
      rendering.term,
      rendering.target,
      rendering.kind,
      rendering.status,
      "human",
      1,
    ],
  );
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => database?.close());
const reviewArgs = {
  apiKey: "test-review",
  actorEmail: "reviewer@example.test",
  locale: "nl",
};

describe("public glossary intake through isolated Postgres", () => {
  it("publishes pending draft wording and validates feedback against that same snapshot", async () => {
    await database.exec(
      `UPDATE "translationGlossary" SET status = 'approved';`,
    );
    await database.query(
      `INSERT INTO "translationReviewEntries" (locale, scope, source_id, revision, draft, approved, updated_at)
      VALUES ($1, 'glossary', $2, 1, $3, $4, 2)`,
      [
        "nl",
        "Calm",
        JSON.stringify({
          source: "Calm",
          context: "effect-name",
          target: "Kalmte",
        }),
        JSON.stringify({
          source: "Calm",
          context: "effect-name",
          target: "Rust",
        }),
      ],
    );
    const query = await database.query(
      `${PUBLIC_GLOSSARY_RENDERING_SELECT} WHERE g.locale = $1`,
      ["nl"],
    );
    const visible = publicGlossaryRendering(
      query.rows[0] as Record<string, unknown>,
    );
    expect(visible).toMatchObject({
      target: "Kalmte",
      status: "draft",
      review_revision: 1,
    });
    expect(languageReadiness("nl", ["Calm"], [visible], null).state).toBe(
      "Glossary in review",
    );
    expect(
      (
        await POST(
          request({
            action: "suggestion",
            details: "Old cached wording",
            version: renderingVersion({ ...rendering, status: "approved" }),
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await POST(
          request({
            action: "suggestion",
            details: "Current proposed wording",
            version: renderingVersion(visible),
          }),
        )
      ).status,
    ).toBe(202);
    expect(
      (await client.query(api.glossaryFeedback.list, reviewArgs))[0],
    ).toMatchObject({ target: "Kalmte", version: renderingVersion(visible) });
    expect(
      (await database.query('SELECT target, status FROM "translationGlossary"'))
        .rows[0],
    ).toEqual({ target: "Rust", status: "approved" });

    // A same-wording restore/edit between page read and submission is a new revision.
    await database.exec('UPDATE "translationReviewEntries" SET revision = 2;');
    expect(
      (
        await POST(
          request({
            action: "reaction",
            choice: "right",
            version: renderingVersion(visible),
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await database.query('SELECT * FROM "glossaryReactionEvents"')).rows,
    ).toHaveLength(0);
    expect(
      (
        await POST(
          request({
            action: "reaction",
            choice: "right",
            version: renderingVersion({ ...visible, review_revision: 2 }),
          }),
        )
      ).status,
    ).toBe(202);
  });

  it("uses canonical approved wording when the draft JSON is null", async () => {
    await database.exec(
      `UPDATE "translationGlossary" SET status = 'approved';`,
    );
    await database.query(
      `INSERT INTO "translationReviewEntries" (locale, scope, source_id, revision, draft, approved, updated_at)
      VALUES ('nl', 'glossary', 'Calm', 2, 'null'::jsonb, $1, 2)`,
      [
        JSON.stringify({
          source: "Calm",
          context: "effect-name",
          target: "Rust",
        }),
      ],
    );
    const query = await database.query(
      `${PUBLIC_GLOSSARY_RENDERING_SELECT} WHERE g.locale = $1`,
      ["nl"],
    );
    const visible = publicGlossaryRendering(
      query.rows[0] as Record<string, unknown>,
    );
    expect(visible).toMatchObject({
      target: "Rust",
      status: "approved",
      review_revision: 2,
    });
    expect(languageReadiness("nl", ["Calm"], [visible], null).state).toBe(
      "Website in preparation",
    );
    expect(
      (
        await POST(
          request({
            action: "reaction",
            choice: "right",
            version: renderingVersion(visible),
          }),
        )
      ).status,
    ).toBe(202);
  });

  it("persists one versioned suggestion on retry and reviews it without changing the glossary", async () => {
    const id = randomUUID();
    expect(
      (
        await POST(
          request({
            action: "suggestion",
            details: "More natural wording",
            alternative: "Kalmte",
            id,
          }),
        )
      ).status,
    ).toBe(202);
    expect(
      (
        await POST(
          request({
            action: "suggestion",
            details: "More natural wording",
            alternative: "Kalmte",
            id,
          }),
        )
      ).status,
    ).toBe(202);
    const rows = await client.query(api.glossaryFeedback.list, reviewArgs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      target: "Rust",
      version: renderingVersion(rendering),
      alternative: "Kalmte",
    });
    expect(rows[0]).not.toHaveProperty("visitor");
    await client.mutation(api.glossaryFeedback.transition, {
      apiKey: "test-review",
      actorEmail: reviewArgs.actorEmail,
      id: rows[0].id as never,
      status: "resolved",
      note: "Reviewed separately",
    });
    expect(
      (await client.query(api.glossaryFeedback.list, reviewArgs))[0].status,
    ).toBe("resolved");
    expect(
      (await database.query('SELECT target, status FROM "translationGlossary"'))
        .rows,
    ).toEqual([{ target: "Rust", status: "draft" }]);
  });
  it("changes and clears one reaction per browser and separates revised renderings", async () => {
    for (const choice of ["right", "right", "improve"] as const)
      expect((await POST(request({ action: "reaction", choice }))).status).toBe(
        202,
      );
    expect(
      await client.query(api.glossaryFeedback.reactions, reviewArgs),
    ).toEqual([expect.objectContaining({ right: 0, improve: 1 })]);
    const current = await GET(
      new NextRequest(
        `https://dose.wiki/api/glossary-feedback/identity?${new URLSearchParams({ locale: "nl", term: "Calm", version: renderingVersion(rendering) })}`,
        { headers: { cookie: `glossary-visitor=${visitor}` } },
      ),
    );
    expect(await current.json()).toEqual({ ok: true, choice: "improve" });
    expect(current.headers.get("cache-control")).toContain("no-store");
    expect(
      (await POST(request({ action: "reaction", choice: "clear" }))).status,
    ).toBe(202);
    expect(
      await client.query(api.glossaryFeedback.reactions, reviewArgs),
    ).toEqual([expect.objectContaining({ right: 0, improve: 0 })]);
    await database.exec(
      "UPDATE \"translationGlossary\" SET target = 'Kalmte', updated_at = 2",
    );
    expect(
      (await POST(request({ action: "reaction", choice: "right" }))).status,
    ).toBe(409);
    expect(
      (
        await POST(
          request({
            action: "reaction",
            choice: "right",
            version: renderingVersion({
              ...rendering,
              target: "Kalmte",
              updated_at: 2,
            }),
          }),
        )
      ).status,
    ).toBe(202);
    expect(
      await client.query(api.glossaryFeedback.reactions, reviewArgs),
    ).toHaveLength(2);
  });
  it("denies wrong credentials, unassigned reviewers and frozen writes", async () => {
    await expect(
      client.query(api.glossaryFeedback.list, {
        ...reviewArgs,
        apiKey: "test-intake",
      }),
    ).rejects.toThrow();
    await expect(
      client.query(api.glossaryFeedback.list, {
        ...reviewArgs,
        actorEmail: "other@example.test",
      }),
    ).rejects.toThrow(/access denied/);
    await expect(
      client.query(api.glossaryFeedback.list, {
        ...reviewArgs,
        actorEmail: "missing@example.test",
      }),
    ).rejects.toThrow();
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    expect(
      (await POST(request({ action: "suggestion", details: "A comment" })))
        .status,
    ).toBe(503);
    expect(await client.query(api.glossaryFeedback.list, reviewArgs)).toEqual(
      [],
    );
  });
  it("rejects invalid content, foreign origins, stale versions and rate-limited requests", async () => {
    for (const body of [
      { details: "" },
      { details: "x".repeat(4001) },
      { details: "hello", locale: "zz" },
      { details: "hello", term: "Unknown" },
    ])
      expect(
        (await POST(request({ action: "suggestion", ...body }))).status,
      ).toBe(400);
    expect(
      (
        await POST(
          request(
            { action: "suggestion", details: "hello" },
            "https://foreign.example",
          ),
        )
      ).status,
    ).toBe(403);
    seam.limited = true;
    expect(
      (await POST(request({ action: "reaction", choice: "right" }))).status,
    ).toBe(429);
  });
});

it("keeps identity reads out of the submission budget while enforcing the write limit", async () => {
  seam.realLimits = true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect(
      (
        await GET(
          new NextRequest("https://dose.wiki/api/glossary-feedback/identity"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await POST(
          request({ action: "suggestion", details: `Comment ${attempt}` }),
        )
      ).status,
    ).toBe(202);
  }
  expect(
    (await POST(request({ action: "suggestion", details: "Fourth comment" })))
      .status,
  ).toBe(429);
});
