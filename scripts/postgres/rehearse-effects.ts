/**
 * Rehearsal: effects and Effect Index writing on Postgres.
 *
 * Every call goes through `PostgresClient` with the owned `api.*`
 * references the app uses. Criteria:
 *
 *   a. round-trip: an Effect Index article written with `upsertArticle` (raw
 *      VCode, embedded `[ref]` citations, ordered media directives, citations
 *      array) reads back through the public `getBySlug` deep-equal to what was
 *      written, plus a fixture row whose stored `body_ast` carries a nested
 *      `$float` wrapper decodes to the same special value on every read path.
 *   b. draft: an unpublished writing is invisible to the public detail, listing,
 *      tag, and export reads and to `PublicDataReadAdapter` under
 *      `DATA_BACKEND=postgres`, while the editor reads still see it.
 *   c. authorization: an update with the scoped `editorArticleWrite` token
 *      preserves publication identity and names the actor in its receipt;
 *      effect updates preserve audio rights fields; wrong key, wrong intent,
 *      editor-role actor, and anonymous calls are refused without writing.
 *   d. ordering: `subjectiveEffects` public listings follow the index each
 *      query uses (`_creationTime`, `_id`; `by_featured` prefix) and the slug
 *      lookups hit `by_slug`.
 *
 *   bun scripts/postgres/rehearse-effects.ts --target postgres://localhost:5432/dosewiki
 *
 * Scratch rows carry a `t10-<random>` prefix and are removed in `finally`
 * unless `--keep` is passed.
 */

import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { decodeDocumentValue, encodeDocumentValue } from "../../lib/postgres/documentCodec";
import { api } from "../../lib/postgres/runtime/api";
import { narrativeRevision } from "../../server/lib/narrativeRevisions";
import { getPublicDataReadAdapter } from "../../lib/data/publicData.reads";
import { deleteDocument, insertDocument, mintDocumentId, selectDocuments, withTransaction } from "../../lib/postgres/documentStore";
import { getDataBackend, getPostgresClient } from "../../lib/postgres/runtime/backend";
import { PostgresClient } from "../../lib/postgres/runtime/client";
import { prepareVCode } from "../../src/features/effects/vcode/editing";
import type { VCodeNode } from "../../src/features/effects/vcode/types";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };

const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

async function refused(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Depth-first `src` attributes, in document order: the media sequence the article embeds. */
function mediaSources(content: unknown, out: string[] = []): string[] {
  if (Array.isArray(content)) for (const child of content) mediaSources(child, out);
  else if (content && typeof content === "object") {
    const node = content as VCodeNode;
    if (node.properties.src) out.push(node.properties.src);
    mediaSources(node.children, out);
  }
  return out;
}

function refNodes(content: unknown, out: Record<string, string>[] = []): Record<string, string>[] {
  if (Array.isArray(content)) for (const child of content) refNodes(child, out);
  else if (content && typeof content === "object") {
    const node = content as VCodeNode;
    if (node.name === "ref") out.push(node.properties);
    refNodes(node.children, out);
  }
  return out;
}

function withoutSystemFields<T extends Record<string, unknown>>(document: T): Omit<T, "_id" | "_creationTime"> {
  const { _id, _creationTime, ...rest } = document;
  return rest;
}

/** The fields on `effectIndexArticles` that identify a publication rather than carry its body. */
const PUBLICATION_IDENTITY_FIELDS = ["kind", "status", "publication_status", "publicationDate", "authors", "authorProfileKeys"] as const;

const VCODE = [
  "[h2]Intensity scale[/h2]",
  "[p]Level one is mild[ref url=\"https://a.example/one\" text=\"Alpha source\"] and level two is moderate[ref url=\"https://b.example/two\" text=\"Beta source\"].[/p]",
  "##cap-img|src=/img/one.png|caption=First image{}",
  "##audio-player|src=/audio/two.mp3{Second clip}",
  "[captioned-image src=\"/img/three.png\"]Third image[/captioned-image]",
  "[ol][li]first[/li][li]second[/li][li]third[/li][/ol]",
].join("\n");

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  const keep = argv.includes("--keep");

  // The app boundaries (`serverClient.queryData` -> `getPostgresClient`)
  // read these at call time; pin them so the adapter reads this run's target,
  // never the PlanetScale URL that `.env.local` also carries.
  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = target;
  process.env.POSTGRES_DIRECT_URL = target;
  const legacyKey = process.env.DATA_ADMIN_KEY;
  if (!legacyKey) throw new Error("DATA_ADMIN_KEY is required (Bun loads it from .env.local)");
  // A run-local scoped token, distinct from the legacy key, so a call that
  // succeeds with it is provably taking the scoped `editorArticleWrite` path.
  const scopedToken = `t10-${randomBytes(24).toString("hex")}`;
  process.env.DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE = scopedToken;

  const pool = new Pool({ connectionString: target, max: 4 });
  const client = PostgresClient.fromUrl(target);
  const prefix = `t10-${mintDocumentId().slice(0, 8)}`;
  const adminEmail = `${prefix}-admin@rehearsal.invalid`;
  const editorEmail = `${prefix}-editor@rehearsal.invalid`;
  const slug = `${prefix}-scale`;
  const draftSlug = `${prefix}-draft`;
  const effectSlug = `${prefix}-effect`;
  const tag = `${prefix}-tag`;
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-effects`);
  const started = performance.now();
  const scratch: { table: "memberships" | "subjectiveEffects"; id: string }[] = [];

  try {
    const now = new Date().toISOString();
    for (const [email, role] of [[adminEmail, "admin"], [editorEmail, "editor"]] as const) {
      scratch.push({ table: "memberships", id: await insertDocument(pool, "memberships", { email, role, createdAt: now, updatedAt: now }) });
    }

    // ---------------------------------------------------------------- a. round-trip
    const written = {
      slug,
      title: `Rehearsal ${prefix}`,
      tags: [tag, "intensity scale", "rehearsal"],
      kind: "article" as const,
      status: "published" as const,
      publication_status: "published",
      bodyFormat: "vcode" as const,
      body_raw: VCODE,
      teaser: "A rehearsal teaser.",
      coverImageUrl: "/img/cover.png",
      authorProfileKeys: ["profile-b", "profile-a"],
      authors: ["Author B", "Author A"],
      featured: false,
      shortDescription: "Short description for the rehearsal.",
      publicationDate: "2026-09-09",
      citations: [
        { url: "https://b.example/two", text: "Beta source" },
        { url: "https://a.example/one", text: "Alpha source" },
        { url: "https://c.example/three", text: "Gamma source" },
      ],
    };
    const expectedAst = prepareVCode(VCODE);
    const operation1 = randomUUID();
    const created = await client.mutation(api.effectIndexArticles.upsertArticle, {
      apiKey: scopedToken,
      actorEmail: adminEmail,
      expectedRevision: narrativeRevision(null),
      operationId: operation1,
      ...written,
    });
    expect("round-trip", "upsertArticle created the writing through the scoped token", created.created === true && created.slug === slug, created);

    const publicArticle = await client.query(api.effectIndexArticles.getBySlug, { slug });
    expect("round-trip", "public getBySlug serves the row", publicArticle !== null && publicArticle._id === created.id);
    const stored = publicArticle ? withoutSystemFields(publicArticle) : null;
    expect("round-trip", "read equals written fields plus the parsed VCode document", isDeepStrictEqual(stored, { ...written, body_ast: expectedAst }), stored);
    expect("round-trip", "raw VCode source is byte-identical", publicArticle?.body_raw === VCODE);
    expect("round-trip", "citations array keeps its order", isDeepStrictEqual(publicArticle?.citations, written.citations));
    expect("round-trip", "tags, authors, and profile keys keep their order", isDeepStrictEqual([publicArticle?.tags, publicArticle?.authors, publicArticle?.authorProfileKeys], [written.tags, written.authors, written.authorProfileKeys]));
    expect(
      "round-trip",
      "embedded [ref] citations survive in document order",
      isDeepStrictEqual(refNodes(publicArticle?.body_ast), [
        { url: "https://a.example/one", text: "Alpha source" },
        { url: "https://b.example/two", text: "Beta source" },
      ]),
      refNodes(publicArticle?.body_ast),
    );
    expect("round-trip", "media directives keep their order", isDeepStrictEqual(mediaSources(publicArticle?.body_ast), ["/img/one.png", "/audio/two.mp3", "/img/three.png"]), mediaSources(publicArticle?.body_ast));
    const listed = (await client.query(api.effectIndexArticles.getAll, {})).find((article) => article.slug === slug);
    expect("round-trip", "public getAll serves the identical document", isDeepStrictEqual(listed, publicArticle));
    const byTag = await client.query(api.effectIndexArticles.getByTag, { tag });
    expect("round-trip", "public getByTag finds it by its tag", byTag.length === 1 && isDeepStrictEqual(byTag[0], publicArticle));
    const replay = await client.mutation(api.effectIndexArticles.upsertArticle, {
      apiKey: scopedToken,
      actorEmail: adminEmail,
      expectedRevision: narrativeRevision(null),
      operationId: operation1,
      ...written,
    });
    expect("round-trip", "replaying the same operation returns the recorded receipt without a second write", isDeepStrictEqual(replay, created) && (await selectDocuments(pool, "narrativeRevisions", { where: '"kind" = $1 AND "key" = $2', params: ["writing", slug] })).length === 1, replay);

    // Fixture rows whose jsonb carries a nested `$float` wrapper: the runtime
    // must hand the handler the decoded special value (NaN, +/-Infinity, -0),
    // identical on the single-row and collection paths.
    await insertDocument(pool, "effectIndexArticles", {
      ...written, slug: `${prefix}-float`, title: "Special-value fixture", tags: [],
      body_ast: encodeDocumentValue([{ name: "p", properties: {}, children: [{ value: Number.NaN }] }]),
    });
    const floatRows = await pool.query(
      `SELECT "slug", "body_ast"::text AS body_ast FROM "effectIndexArticles" WHERE "body_ast"::text LIKE '%$float%' AND ("status" IS NULL OR "status" <> 'draft') ORDER BY "slug" LIMIT 1`,
    );
    const floatRow = floatRows.rows[0] as { slug: string; body_ast: string } | undefined;
    expect("round-trip", "fixture has a published row with a nested $float", floatRow !== undefined);
    if (floatRow) {
      const expectedFloatAst = decodeDocumentValue(JSON.parse(floatRow.body_ast));
      const single = await client.query(api.effectIndexArticles.getBySlug, { slug: floatRow.slug });
      const fromList = (await client.query(api.effectIndexArticles.getAll, {})).find((article) => article.slug === floatRow.slug);
      expect("round-trip", "nested $float decodes to the special value on getBySlug", single !== null && isDeepStrictEqual(single.body_ast, expectedFloatAst), { slug: floatRow.slug, stored: floatRow.body_ast, read: String(JSON.stringify(single?.body_ast, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v))) });
      expect("round-trip", "nested $float decodes identically on getAll", fromList !== undefined && isDeepStrictEqual(fromList.body_ast, expectedFloatAst));
    }

    // ---------------------------------------------------------------- b. draft
    const draftOperation = randomUUID();
    const draft = await client.mutation(api.effectIndexArticles.upsertArticle, {
      apiKey: scopedToken,
      actorEmail: adminEmail,
      expectedRevision: narrativeRevision(null),
      operationId: draftOperation,
      slug: draftSlug,
      title: `Rehearsal draft ${prefix}`,
      tags: [tag],
      kind: "article",
      status: "draft",
      publication_status: "draft",
      bodyFormat: "vcode",
      body_raw: "[p]Not yet public.[/p]",
    });
    expect("draft", "draft writing stored", draft.created === true, draft);
    expect("draft", "public getBySlug hides the draft", (await client.query(api.effectIndexArticles.getBySlug, { slug: draftSlug })) === null);
    expect("draft", "public getAll omits the draft", !(await client.query(api.effectIndexArticles.getAll, {})).some((article) => article.slug === draftSlug));
    expect("draft", "public getByTag omits the draft", !(await client.query(api.effectIndexArticles.getByTag, { tag })).some((article) => article.slug === draftSlug));
    const editorList = await client.query(api.effectIndexArticles.listForEditor, { apiKey: scopedToken, actorEmail: editorEmail });
    expect("draft", "listForEditor (editor floor) still lists the draft as a draft", editorList.some((row) => row.slug === draftSlug && row.status === "draft"));
    const editorRow = await client.query(api.effectIndexArticles.getForEditor, { apiKey: scopedToken, actorEmail: editorEmail, slug: draftSlug });
    expect("draft", "getForEditor opens the draft with its base revision", editorRow?.status === "draft" && editorRow.baseRevision === draft.revision && editorRow.history.length === 1);

    expect("draft", "DATA_BACKEND selects postgres for the app read boundary", getDataBackend() === "postgres");
    const adapter = getPublicDataReadAdapter();
    expect("adapter", "getPublicEffectIndexArticleBySlug hides the draft", (await adapter.getPublicEffectIndexArticleBySlug(draftSlug)) === null);
    const adapterList = await adapter.getPublicEffectIndexArticles();
    expect("adapter", "getPublicEffectIndexArticles serves the published scratch row from Postgres and omits the draft", adapterList.some((article) => article.slug === slug) && !adapterList.some((article) => article.slug === draftSlug));
    const adapterPublished = await adapter.getPublishedEffectIndexArticles();
    expect("adapter", "getPublishedEffectIndexArticles (index/export listing) includes the published row and omits the draft", adapterPublished.some((article) => article.slug === slug) && !adapterPublished.some((article) => article.slug === draftSlug));
    const adapterArticle = await adapter.getPublicEffectIndexArticleBySlug(slug);
    expect(
      "adapter",
      "getPublicEffectIndexArticleBySlug projects the written row unchanged",
      adapterArticle !== null
        && adapterArticle.body_raw === VCODE
        && isDeepStrictEqual(adapterArticle.body_ast, expectedAst)
        && isDeepStrictEqual(adapterArticle.citations, written.citations)
        && isDeepStrictEqual(adapterArticle.tags, written.tags)
        && adapterArticle.kind === "article"
        && adapterArticle.publication_status === "published",
      adapterArticle,
    );

    // ---------------------------------------------------------------- c. authorization
    const update = {
      title: `Rehearsal ${prefix} (revised)`,
      publicationDate: "2026-09-10",
      authors: ["Author C"],
      authorProfileKeys: ["profile-c"],
      publication_status: "published",
      status: "published" as const,
      kind: "article" as const,
    };
    const operation2 = randomUUID();
    const revised = await client.mutation(api.effectIndexArticles.upsertArticle, {
      apiKey: scopedToken,
      actorEmail: adminEmail,
      slug,
      expectedRevision: created.revision,
      operationId: operation2,
      ...update,
    });
    const revisedArticle = await client.query(api.effectIndexArticles.getBySlug, { slug });
    expect("authorization", "scoped-token update applied as a patch", revised.created === false && revisedArticle?.title === update.title && revisedArticle.body_raw === VCODE && isDeepStrictEqual(revisedArticle.citations, written.citations), revised);
    expect(
      "authorization",
      "publication identity fields read back as written",
      revisedArticle !== null && PUBLICATION_IDENTITY_FIELDS.every((field) => isDeepStrictEqual(revisedArticle[field], update[field])),
      revisedArticle && Object.fromEntries(PUBLICATION_IDENTITY_FIELDS.map((field) => [field, revisedArticle[field]])),
    );
    const receipts = await selectDocuments(pool, "narrativeRevisions", { where: '"kind" = $1 AND "key" = $2', params: ["writing", slug], orderBy: '"_creationTime" DESC' });
    const receipt = receipts[0];
    expect(
      "authorization",
      "receipt names the delegated admin actor, the operation, and both publications",
      receipts.length === 2
        && receipt.actorEmail === adminEmail
        && receipt.actorRole === "admin"
        && receipt.operationId === operation2
        && receipt.baseRevision === created.revision
        && receipt.revision === revised.revision
        && receipt.documentId === created.id
        && isDeepStrictEqual(receipt.publications, ["dosewiki", "effectindex"]),
      receipt && { actorEmail: receipt.actorEmail, actorRole: receipt.actorRole, operationId: receipt.operationId, publications: receipt.publications },
    );
    expect("authorization", "receipt diff records only the changed source fields", isDeepStrictEqual(receipt?.after, { title: update.title, publicationDate: update.publicationDate, authors: update.authors, authorProfileKeys: update.authorProfileKeys, slug, _id: created.id }), receipt?.after);
    const editorView = await client.query(api.effectIndexArticles.getForEditor, { apiKey: scopedToken, actorEmail: editorEmail, slug });
    expect("authorization", "getForEditor reports the new base revision and actor history", editorView?.baseRevision === revised.revision && editorView.history[0]?.actorEmail === adminEmail && editorView.history.length === 2);

    // Rights metadata on subjective effects. The scratch effect is inserted
    // through the document store (which registers `documentIds`, so `db.get`
    // resolves it), then updated through the real mutation.
    const effectId = await insertDocument(pool, "subjectiveEffects", { slug: effectSlug, name: `Rehearsal effect ${prefix}`, tags: ["visual", tag], summary: "before", description_raw: "[p]Before.[/p]", featured: true });
    scratch.push({ table: "subjectiveEffects", id: effectId });
    const audio = [
      {
        title: "Clip one", artist: "Artist One", artist_url: "https://artist.example/one", description: "First clip", resource: "https://media.example/one.mp3",
        rights_status: "permission-granted" as const, license_name: "CC BY 4.0", license_url: "https://creativecommons.org/licenses/by/4.0/", credit_line: "Artist One, used with permission",
        source_url: "https://source.example/one", rightsholder: "Artist One", permission_notes: "Granted by email 2026-09-09", removal_contact: "rights@rehearsal.invalid",
      },
      { title: "Clip two", artist: "Artist Two", resource: "https://media.example/two.mp3", rights_status: "creator-retained" as const, credit_line: "Artist Two" },
    ];
    const effectCitations = [{ url: "https://c.example/effect", text: "Effect source", from: "Author C" }, { url: "https://d.example/effect", text: "Second source" }];
    const updated = await client.mutation(api.subjectiveEffects.update, { apiKey: legacyKey, actorEmail: adminEmail, slug: effectSlug, updates: { audio_replications: audio, citations: effectCitations, gallery_order: ["rep-b", "rep-a"] } });
    const effectDetail = await client.query(api.subjectiveEffects.getPublicBySlug, { slug: effectSlug });
    expect("rights", "subjectiveEffects.update applied with the admin key", updated.success === true && effectDetail?.slug === effectSlug);
    expect("rights", "every rights field round-trips on each audio replication", isDeepStrictEqual(effectDetail?.audio_replications, audio), effectDetail?.audio_replications);
    expect("rights", "citations and gallery order keep their order", isDeepStrictEqual(effectDetail?.citations, effectCitations) && isDeepStrictEqual(effectDetail?.gallery_order, ["rep-b", "rep-a"]));
    const effectReceipts = await selectDocuments(pool, "narrativeRevisions", { where: '"kind" = $1 AND "key" = $2', params: ["effect", effectSlug] });
    expect("rights", "maintenance receipt records the admin actor on the effect", effectReceipts.length === 1 && effectReceipts[0].actorEmail === adminEmail && effectReceipts[0].actorRole === "admin" && effectReceipts[0].documentId === effectId);
    const adapterEffect = await adapter.getPublicEffectBySlug(effectSlug);
    expect("rights", "adapter getPublicEffectBySlug serves the rights fields from Postgres", isDeepStrictEqual(adapterEffect?.audio_replications, audio));
    expect("rights", "adapter effect listings include the scratch effect", (await adapter.getPublicEffects()).some((effect) => effect.slug === effectSlug) && (await adapter.getPublicEffectArticles()).some((effect) => effect.slug === effectSlug) && (await adapter.getPublicEffectsByCategory("visual")).some((effect) => effect.slug === effectSlug));

    // Scoped-token effect publication through the editor mutation.
    const editorEffect = await client.query(api.subjectiveEffects.getForEditor, { apiKey: scopedToken, actorEmail: adminEmail, slug: effectSlug });
    const effectDraft = { name: `Rehearsal effect ${prefix}`, summary: "after", description_raw: "[p]After[ref url=\"https://c.example/effect\" text=\"Effect source\"].[/p]", tags: ["visual", tag], citations: effectCitations };
    const effectOperation = randomUUID();
    const published = await client.mutation(api.subjectiveEffects.publishFromEditor, { apiKey: scopedToken, actorEmail: adminEmail, slug: effectSlug, expectedRevision: editorEffect!.baseRevision, operationId: effectOperation, draft: effectDraft });
    const afterPublish = await client.query(api.subjectiveEffects.getPublicBySlug, { slug: effectSlug });
    expect("rights", "publishFromEditor with the scoped token updates narrative and parses its VCode", afterPublish?.summary === "after" && isDeepStrictEqual(afterPublish.description_ast, prepareVCode(effectDraft.description_raw)) && isDeepStrictEqual(afterPublish.audio_replications, audio), published);
    const effectReceipt = (await selectDocuments(pool, "narrativeRevisions", { where: '"kind" = $1 AND "operationId" = $2', params: ["effect", effectOperation] }))[0];
    expect("rights", "effect receipt names the actor and operation", effectReceipt?.actorEmail === adminEmail && effectReceipt.revision === published.revision && effectReceipt.baseRevision === editorEffect!.baseRevision);

    // Refusals. None may write.
    const before = { article: await client.query(api.effectIndexArticles.getBySlug, { slug }), effect: afterPublish, receipts: (await pool.query('SELECT count(*)::int AS n FROM "narrativeRevisions" WHERE "key" LIKE $1', [`${prefix}%`])).rows[0].n as number };
    const attempts: { name: string; run: () => Promise<unknown>; pattern: RegExp }[] = [
      { name: "wrong api key", pattern: /Authentication failed/, run: () => client.mutation(api.effectIndexArticles.upsertArticle, { apiKey: `${scopedToken}-wrong`, actorEmail: adminEmail, slug, expectedRevision: revised.revision, operationId: randomUUID(), title: "never" }) },
      { name: "editor-role actor below the admin floor", pattern: /Admin access required/, run: () => client.mutation(api.effectIndexArticles.upsertArticle, { apiKey: scopedToken, actorEmail: editorEmail, slug, expectedRevision: revised.revision, operationId: randomUUID(), title: "never" }) },
      { name: "no credentials (identity provider absent)", pattern: /Authentication required/, run: () => client.mutation(api.effectIndexArticles.upsertArticle, { slug, expectedRevision: revised.revision, operationId: randomUUID(), title: "never" }) },
      { name: "editorArticleWrite token against the legacyAdmin intent", pattern: /Authentication failed/, run: () => client.mutation(api.subjectiveEffects.update, { apiKey: scopedToken, slug: effectSlug, updates: { summary: "never" } }) },
      { name: "scoped token with a stale revision", pattern: /changed\. Reload/, run: () => client.mutation(api.effectIndexArticles.upsertArticle, { apiKey: scopedToken, actorEmail: adminEmail, slug, expectedRevision: created.revision, operationId: randomUUID(), title: "never" }) },
    ];
    for (const attempt of attempts) {
      const message = await refused(attempt.run);
      expect("refused", attempt.name, message !== null && attempt.pattern.test(message), message);
    }
    const after = { article: await client.query(api.effectIndexArticles.getBySlug, { slug }), effect: await client.query(api.subjectiveEffects.getPublicBySlug, { slug: effectSlug }), receipts: (await pool.query('SELECT count(*)::int AS n FROM "narrativeRevisions" WHERE "key" LIKE $1', [`${prefix}%`])).rows[0].n as number };
    expect("refused", "refused calls wrote nothing", isDeepStrictEqual(before, after), { before: before.receipts, after: after.receipts });

    // ---------------------------------------------------------------- d. ordering
    const all = await client.query(api.subjectiveEffects.getAll, {});
    const sqlOrder = (await pool.query('SELECT "_id" FROM "subjectiveEffects" ORDER BY "_creationTime" ASC, "_id" ASC')).rows.map((row) => row._id as string);
    const monotonic = all.every((doc, index) => index === 0 || all[index - 1]._creationTime < doc._creationTime || (all[index - 1]._creationTime === doc._creationTime && all[index - 1]._id < doc._id));
    expect("ordering", `getAll (${all.length} rows) is monotonic on (_creationTime, _id)`, monotonic);
    expect("ordering", "getAll order equals the SQL by_creation_time order", isDeepStrictEqual(all.map((doc) => doc._id), sqlOrder));
    const previews = await client.query(api.subjectiveEffects.getPublicPreviews, {});
    const articles = await client.query(api.subjectiveEffects.getPublicArticles, {});
    expect("ordering", "getPublicPreviews and getPublicArticles follow the same order", isDeepStrictEqual(previews.map((row) => row.slug), all.map((row) => row.slug)) && isDeepStrictEqual(articles.map((row) => row.slug), all.map((row) => row.slug)));
    const featured = await client.query(api.subjectiveEffects.getFeatured, {});
    const sqlFeatured = (await pool.query('SELECT "_id" FROM "subjectiveEffects" WHERE "featured" = true ORDER BY "_creationTime" ASC, "_id" ASC')).rows.map((row) => row._id as string);
    expect("ordering", `getFeatured (${featured.length} rows) is the by_featured=true range in creation order`, featured.length > 0 && featured.every((doc) => doc.featured === true) && isDeepStrictEqual(featured.map((doc) => doc._id), sqlFeatured));
    const visual = await client.query(api.subjectiveEffects.getPublicByCategory, { category: "visual" });
    const allSlugs = all.map((doc) => doc.slug);
    const visualPositions = visual.map((row) => allSlugs.indexOf(row.slug));
    expect("ordering", "getPublicByCategory preserves creation order within the filtered subset", visual.some((row) => row.slug === effectSlug) && visualPositions.every((position, index) => position >= 0 && (index === 0 || visualPositions[index - 1] < position)));
    const sample = [...all].sort((left, right) => (left.slug < right.slug ? -1 : 1)).slice(0, 5);
    const lookups = await Promise.all(sample.map((doc) => client.query(api.subjectiveEffects.getBySlug, { slug: doc.slug })));
    expect("ordering", "getBySlug resolves each sampled slug to the same document", lookups.every((doc, index) => doc !== null && doc._id === sample[index]._id && isDeepStrictEqual(doc, sample[index])));
    const publicLookups = await Promise.all(sample.map((doc) => client.query(api.subjectiveEffects.getPublicBySlug, { slug: doc.slug })));
    expect("ordering", "getPublicBySlug projects the same rows", publicLookups.every((doc, index) => doc?.slug === sample[index].slug && doc.name === sample[index].name));
    expect("ordering", "unknown slug reads as null on both lookups", (await client.query(api.subjectiveEffects.getBySlug, { slug: `${prefix}-missing` })) === null && (await client.query(api.subjectiveEffects.getPublicBySlug, { slug: `${prefix}-missing` })) === null);
    const tagsSeen = await client.query(api.subjectiveEffects.getAllTags, {});
    expect("ordering", "getAllTags includes the scratch tag", tagsSeen.includes(tag));
  } finally {
    if (!keep) {
      await withTransaction(pool, async (tx) => {
        for (const table of ["effectIndexArticles", "narrativeRevisions"] as const) {
          const column = table === "narrativeRevisions" ? "key" : "slug";
          for (const row of await selectDocuments(tx, table, { where: `"${column}" LIKE $1`, params: [`${prefix}%`] })) await deleteDocument(tx, table, row._id as string);
        }
        for (const { table, id } of scratch) await deleteDocument(tx, table, id);
      });
    }
    const passed = checks.filter((c) => c.pass).length;
    const summary = {
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      prefix,
      kept: keep,
      elapsedMs: Math.round(performance.now() - started),
      passed,
      failed: checks.length - passed,
      checks,
    };
    fs.mkdirSync(runDirectory, { recursive: true });
    fs.writeFileSync(path.join(runDirectory, "report.json"), JSON.stringify(summary, null, 2));
    console.log(`\nReport: ${path.relative(ROOT, runDirectory)}/report.json`);
    console.log(JSON.stringify({ passed, failed: summary.failed, elapsedMs: summary.elapsedMs }));
    process.exitCode = summary.failed === 0 ? 0 : 1;
    await Promise.all([client.end(), getPostgresClient().end(), pool.end()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
