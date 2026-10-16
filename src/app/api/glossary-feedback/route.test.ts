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
import { renderingVersion } from "@/features/language-glossary/languageGlossary";
import { POST } from "./route";

vi.setConfig({ testTimeout: 30000 });

const seam = vi.hoisted(() => ({
  capability: null as unknown,
  limited: false,
  client: null as unknown,
}));
vi.mock("@server/data/serverWriteCapability", async (original) => ({
  ...(await original<object>()),
  getPublicIntakeWriteCapability: () => seam.capability,
}));
vi.mock("@server/postgres/runtime/backend", () => ({
  getPostgresClient: () => seam.client,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  getClientIp: () => "127.0.0.1",
  enforceRateLimit: async () =>
    seam.limited ? new Response("rate limited", { status: 429 }) : null,
}));

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
  it("keeps live approved wording public over a pending draft and refuses feedback on stale wording", async () => {
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
      target: "Rust",
      status: "approved",
      review_revision: 1,
    });
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
  it("rejects foreign origins and rate-limited requests", async () => {
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
