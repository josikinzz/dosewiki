/**
 * Rehearsal: the layout, copy, warning, quote, site config,
 * molecule and reagent tools run unchanged on Postgres.
 *
 * Every call goes through `PostgresClient` with the same `api.*`
 * references the app uses, so the registered native handlers, their auth
 * floors, their optimistic-concurrency checks and their journal rows are all
 * exercised as the app would. Public molecule and reagent reads go through
 * `PublicDataReadAdapter` with `DATA_BACKEND=postgres`, which is the exact
 * switch the Next server boundaries take.
 *
 * Scratch rows carry a `t14-`/`t15-` prefix and are removed in `finally`.
 * The singleton tables (`indexLayouts` by type, `categoryLayout`) resolve
 * their row with `.first()`, so the rehearsal seeds scratch rows with an
 * `_creationTime` older than any fixture row: the handlers then read and
 * write the scratch row and the fixture stays untouched.
 *
 *   bun scripts/postgres/rehearse-content-tools.ts --target postgres://localhost:5432/dosewiki
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { PostgresError } from "../../lib/postgres/runtime/values";
import { api } from "../../lib/postgres/runtime/api";
import { getPostgresClient } from "../../lib/postgres/runtime/backend";
import { getPublicDataReadAdapter } from "../../lib/data/publicData.reads";
import { deleteDocument, insertDocument, mintDocumentId, selectDocuments } from "../../lib/postgres/documentStore";
import { proposalComparableDocument } from "../../lib/proposals/proposalBaseline";
import {
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  SAFETY_BANNER_ICON_SIZE_MAX,
} from "../../src/data/substanceWarningBanners";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];

function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

/** The thrown error, or null when the call succeeded. */
async function failure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
}

/** One property of an untyped jsonb payload, or undefined when the value is not an object. */
function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}

function errorCode(error: unknown): unknown {
  return error instanceof PostgresError ? field(error.data, "code") : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const isAuthRefusal = (error: unknown) =>
  error instanceof Error && (error.name === "AuthError" || /access required|Authentication (failed|required)/.test(error.message));

async function count(pool: Pool, sql: string, params: unknown[] = []): Promise<number> {
  const result = await pool.query(`SELECT count(*)::int AS n FROM ${sql}`, params);
  return result.rows[0].n as number;
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  const keep = argv.includes("--keep");

  // The app's backend switch reads process env at call time: point it at the rehearsal target
  // before anything asks for a client, and never let `.env.local`'s PlanetScale URL leak in.
  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = target;
  delete process.env.POSTGRES_DIRECT_URL;

  const apiKey = process.env.DATA_ADMIN_KEY;
  if (!apiKey) throw new Error("DATA_ADMIN_KEY is required (Bun loads it from .env.local)");
  const badKey = `${apiKey}-not-the-key`;

  const run = mintDocumentId().slice(0, 8);
  const T14 = `t14-${run}`;
  const T15 = `t15-${run}`;
  const editorEmail = `${T14}-editor@rehearsal.invalid`;
  const adminActor = { apiKey, actorEmail: `${T14}-admin@rehearsal.invalid` };
  const editorActor = { apiKey, actorEmail: editorEmail };

  const pool = new Pool({ connectionString: target, max: 4 });
  const client = getPostgresClient();
  const adapter = getPublicDataReadAdapter();
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-content-tools`);
  const started = performance.now();

  // Scratch rows seeded outside the runtime; `insertDocument` registers their `documentIds` entry so `ctx.db.patch(id)` finds them.
  const seeded: Array<{ table: Parameters<typeof insertDocument>[1]; id: string }> = [];
  async function seed(table: Parameters<typeof insertDocument>[1], document: Record<string, unknown>): Promise<string> {
    const id = await insertDocument(pool, table, document);
    seeded.push({ table, id });
    return id;
  }
  /** Rows the handlers created under a scratch key: remove them and their id registrations. */
  const purges: Array<{ table: string; where: string; params: unknown[] }> = [];
  const purge = (table: string, where: string, ...params: unknown[]) => purges.push({ table, where, params });

  let createdAboutRow = false;
  let createdBannerDisplayRow = false;

  try {
    // Scratch actors. An API-key call without actorEmail is an admin; a delegated actorEmail is looked up in memberships.
    const now = new Date().toISOString();
    await seed("memberships", { email: editorEmail, role: "editor", createdAt: now, updatedAt: now });
    await seed("memberships", { email: adminActor.actorEmail, role: "admin", createdAt: now, updatedAt: now });

    // ------------------------------------------------------------------ index layouts
    {
      const S = "indexLayouts";
      const section = (key: string, drugs: string[]) => ({ key, label: key.toUpperCase(), drugs, notes: `notes ${key}`, link: { type: "chemicalClass" as const, value: `class-${key}` } });
      const category = (key: string, drugs: string[]) => ({ key, label: key.toUpperCase(), iconKey: `icon-${key}`, notes: `notes ${key}`, drugs, sections: [section(`${key}-1`, drugs.slice(0, 1)), section(`${key}-2`, drugs.slice(1))] });
      const before = { version: 1, categories: [category("alpha", ["a1", "a2"]), category("beta", ["b1", "b2"]), category("gamma", ["g1", "g2"])] };
      const layoutId = await seed("indexLayouts", { type: "psychoactive", ...before, _creationTime: 1 });
      const mirrorId = await seed("categoryLayout", { version: 0, categories: [], _creationTime: 1 });
      const categoryLayoutRows = await count(pool, '"categoryLayout"');
      purge("contentRevisions", '"operationId" LIKE $1', `${T14}%`);

      const loaded = await client.query(api.indexLayouts.getByType, { type: "psychoactive" });
      expect(S, "getByType resolves the scratch psychoactive layout (oldest row wins)", loaded?._id === layoutId, { got: loaded?._id, want: layoutId });
      const editor = await client.query(api.indexLayouts.getForEditor, { ...adminActor, type: "psychoactive" });
      const r0 = editor?.revision ?? Number.NaN;
      expect(S, "getForEditor returns a numeric revision", Number.isInteger(r0), editor?.revision);

      const after = { version: 2, categories: [before.categories[2], before.categories[0], { ...before.categories[1], sections: [...before.categories[1].sections].reverse() }] };
      const op1 = `${T14}-layout-1`;
      const saved = await client.mutation(api.indexLayouts.save, { ...adminActor, type: "psychoactive", ...after, expected: before, expectedRevision: r0, operationId: op1 });
      expect(S, "save with matching expected content and revision commits", saved.updated === true && saved.revision === r0 + 1 && !saved.replayed && !saved.unchanged, saved);
      const reloaded = await client.query(api.indexLayouts.getByType, { type: "psychoactive" });
      expect(S, "reload returns the changed value", reloaded?._id === layoutId && reloaded.version === 2);
      expect(S, "category order is preserved exactly", JSON.stringify(reloaded?.categories.map((c) => c.key)) === JSON.stringify(["gamma", "alpha", "beta"]), reloaded?.categories.map((c) => c.key));
      expect(S, "nested section order is preserved exactly", JSON.stringify(reloaded?.categories[2].sections.map((s) => s.key)) === JSON.stringify(["beta-2", "beta-1"]));
      expect(S, "optional notes and link survive the jsonb round trip", reloaded?.categories[0].notes === "notes gamma" && reloaded.categories[0].sections[0].link?.value === "class-gamma-1");
      const all = await client.query(api.indexLayouts.getAll, {});
      expect(S, "getAll includes the saved layout", all.some((row) => row._id === layoutId && row.version === 2));
      const editorRows = await client.query(api.indexLayouts.getAllForEditor, adminActor);
      expect(S, "getAllForEditor reports the new revision for psychoactive", editorRows.find((row) => row.type === "psychoactive")?.revision === r0 + 1);

      const [journal] = await selectDocuments(pool, "contentRevisions", { where: '"operationId" = $1', params: [op1] });
      expect(S, "contentRevisions row committed with the change", journal?.table === "indexLayouts" && journal.key === "psychoactive" && journal.action === "update" && journal.revision === String(r0 + 1) && field(journal.after, "version") === 2, journal && { action: journal.action, revision: journal.revision });

      const mirror = await client.query(api.categoryLayout.get, {});
      expect(S, "psychoactive save mirrors into the categoryLayout row the public grid reads", mirror?._id === mirrorId && mirror.version === 2 && JSON.stringify(mirror.categories.map((c) => c.key)) === JSON.stringify(["gamma", "alpha", "beta"]), mirror && { id: mirror._id, version: mirror.version });
      expect(S, "mirror projection drops notes and section links", mirror !== null && !("notes" in mirror.categories[0]) && !("link" in mirror.categories[0].sections[0]));
      expect(S, "mirror replaced in place, no extra categoryLayout row", (await count(pool, '"categoryLayout"')) === categoryLayoutRows);

      const replay = await client.mutation(api.indexLayouts.save, { ...adminActor, type: "psychoactive", ...after, expected: before, expectedRevision: r0, operationId: op1 });
      expect(S, "same operationId replays the receipt without a second journal row", replay.replayed === true && replay.revision === r0 + 1 && (await count(pool, '"contentRevisions" WHERE "operationId" = $1', [op1])) === 1, replay);

      const journalRows = await count(pool, '"contentRevisions" WHERE "table" = $1 AND "key" = $2', ["indexLayouts", "psychoactive"]);
      const staleRevision = await failure(() => client.mutation(api.indexLayouts.save, { ...adminActor, type: "psychoactive", ...after, version: 3, expectedRevision: r0, operationId: `${T14}-layout-stale-rev` }));
      expect(S, "stale expectedRevision is refused with EDIT_CONFLICT", errorCode(staleRevision) === "EDIT_CONFLICT", errorMessage(staleRevision));
      const staleContent = await failure(() => client.mutation(api.indexLayouts.save, { ...adminActor, type: "psychoactive", ...after, version: 3, expected: before, operationId: `${T14}-layout-stale-content` }));
      expect(S, "stale expected content is refused with EDIT_CONFLICT", errorCode(staleContent) === "EDIT_CONFLICT", errorMessage(staleContent));
      expect(S, "refused saves wrote no journal row and left the layout unchanged", (await count(pool, '"contentRevisions" WHERE "table" = $1 AND "key" = $2', ["indexLayouts", "psychoactive"])) === journalRows && (await client.query(api.indexLayouts.getByType, { type: "psychoactive" }))?.version === 2);

      const editorSave = await failure(() => client.mutation(api.indexLayouts.save, { ...editorActor, type: "psychoactive", ...after, version: 4 }));
      expect(S, "editor-role actor is below the admin floor", isAuthRefusal(editorSave) && /Admin access required/.test(errorMessage(editorSave)), errorMessage(editorSave));
      const badKeySave = await failure(() => client.mutation(api.indexLayouts.save, { apiKey: badKey, type: "psychoactive", ...after, version: 4 }));
      expect(S, "invalid API key is refused", isAuthRefusal(badKeySave), errorMessage(badKeySave));
      expect(S, "unauthorized saves left the layout unchanged", (await client.query(api.indexLayouts.getByType, { type: "psychoactive" }))?.version === 2);

      // categoryLayout's own script-only save and clear act on the same `.first()` row.
      const S2 = "categoryLayout";
      const direct = await client.mutation(api.categoryLayout.save, { ...adminActor, version: 7, categories: [{ key: "solo", label: "Solo", iconKey: "icon", sections: [], drugs: ["x"] }] });
      expect(S2, "direct save replaces the singleton row", direct.updated === true && direct.id === mirrorId && (await client.query(api.categoryLayout.get, {}))?.version === 7, direct);
      const cleared = await client.mutation(api.categoryLayout.clear, adminActor);
      const afterClear = await client.query(api.categoryLayout.get, {});
      expect(S2, "clear deletes the singleton row and get falls through to the next row (null once the table is empty)", cleared.deleted === true && afterClear?._id !== mirrorId && (await count(pool, '"categoryLayout"')) === categoryLayoutRows - 1, { afterClear: afterClear?._id });
      seeded.splice(seeded.findIndex((row) => row.id === mirrorId), 1);
    }

    // ------------------------------------------------------------------ site config
    {
      const S = "siteConfig";
      const aboutBefore = await client.query(api.siteConfig.getAbout, {});
      if (aboutBefore === null) {
        expect(S, "getAbout returns null while no about row exists", true);
        createdAboutRow = true;
      } else {
        expect(S, "getAbout returns null while no about row exists", true, { skipped: "an about row already exists in this database; absence not observable" });
      }
      const bannerBefore = await client.query(api.siteConfig.getBannerDisplay, {});
      const bannerRowExists = (await count(pool, '"siteConfig" WHERE "key" = $1', ["safety-banner-display"])) > 0;
      expect(S, "getBannerDisplay answers the default size while no row exists", bannerRowExists || bannerBefore.iconSize === SAFETY_BANNER_ICON_SIZE_DEFAULT, { bannerBefore, bannerRowExists });

      const r0 = (await client.query(api.siteConfig.getAboutForEditor, adminActor)).about?.revision ?? 0;
      const op1 = `${T14}-about-1`;
      const first = await client.mutation(api.siteConfig.saveAbout, { ...adminActor, aboutMarkdown: `# ${T14} first`, aboutSubtitle: "first", founderProfileKeys: ["f1"], expectedRevision: r0, operationId: op1 });
      expect(S, "saveAbout commits with a new revision", first.revision === r0 + 1 && !first.replayed && !first.unchanged, first);
      const loaded = await client.query(api.siteConfig.getAbout, {});
      expect(S, "getAbout reloads the saved value", loaded?.aboutMarkdown === `# ${T14} first` && loaded.key === "about");
      const [journal] = await selectDocuments(pool, "contentRevisions", { where: '"operationId" = $1', params: [op1] });
      expect(S, "contentRevisions row committed for siteConfig/about", journal?.table === "siteConfig" && journal.key === "about" && journal.revision === String(r0 + 1) && journal.action === (aboutBefore === null ? "create" : "update"), journal && { action: journal.action });

      const second = await client.mutation(api.siteConfig.saveAbout, { ...adminActor, aboutMarkdown: `# ${T14} second`, aboutSubtitle: "second", founderProfileKeys: ["f1", "f2"], expected: proposalComparableDocument("about", loaded), operationId: `${T14}-about-2` });
      expect(S, "saveAbout with matching expected content commits", second.revision === r0 + 2 && (await client.query(api.siteConfig.getAbout, {}))?.aboutSubtitle === "second", second);
      const journalRows = await count(pool, '"contentRevisions" WHERE "table" = $1 AND "key" = $2', ["siteConfig", "about"]);
      const stale = await failure(() => client.mutation(api.siteConfig.saveAbout, { ...adminActor, aboutMarkdown: "never", expected: proposalComparableDocument("about", loaded), operationId: `${T14}-about-stale` }));
      expect(S, "stale expected content is refused with EDIT_CONFLICT", errorCode(stale) === "EDIT_CONFLICT", errorMessage(stale));
      expect(S, "refused save wrote no journal row and left the about row unchanged", (await count(pool, '"contentRevisions" WHERE "table" = $1 AND "key" = $2', ["siteConfig", "about"])) === journalRows && (await client.query(api.siteConfig.getAbout, {}))?.aboutSubtitle === "second");
      const editorSave = await failure(() => client.mutation(api.siteConfig.saveAbout, { ...editorActor, aboutMarkdown: "never" }));
      expect(S, "editor-role actor is refused", isAuthRefusal(editorSave), errorMessage(editorSave));

      if (!bannerRowExists) {
        createdBannerDisplayRow = true;
        const stored = await client.mutation(api.siteConfig.saveBannerDisplay, { ...adminActor, iconSize: 500 });
        const display = await client.query(api.siteConfig.getBannerDisplay, {});
        expect(S, "saveBannerDisplay stores and echoes the clamped size", stored.iconSize === SAFETY_BANNER_ICON_SIZE_MAX && display.iconSize === SAFETY_BANNER_ICON_SIZE_MAX, { stored, display });
      } else {
        expect(S, "saveBannerDisplay stores and echoes the clamped size", true, { skipped: "banner display row already exists; not overwriting a row this run did not create" });
      }
    }

    // ------------------------------------------------------------------ copy blocks
    {
      const S = "copyBlocks";
      const key = `${T14}-block`;
      purge("copyBlocks", '"key" = $1', key);
      expect(S, "getByKey is null before the block exists", (await client.query(api.copyBlocks.getByKey, { key })) === null);
      const op1 = `${T14}-copy-1`;
      const created = await client.mutation(api.copyBlocks.upsert, { ...adminActor, key, kind: "markdown", body: "first body", label: "Rehearsal block", group: "rehearsal", operationId: op1 });
      expect(S, "upsert creates the block at revision 1", created.updated === false && created.revision === 1 && created.key === key, created);
      const loaded = await client.query(api.copyBlocks.getByKey, { key });
      expect(S, "getByKey reloads the created block", loaded?._id === created.id && loaded.body === "first body" && loaded.kind === "markdown");
      expect(S, "getAll (the public read) includes the block", (await client.query(api.copyBlocks.getAll, {})).some((row) => row.key === key));
      expect(S, "getForEditor reports revision 1", (await client.query(api.copyBlocks.getForEditor, { ...adminActor, key })).revision === 1);
      const [journal] = await selectDocuments(pool, "contentRevisions", { where: '"operationId" = $1', params: [op1] });
      expect(S, "contentRevisions create row carries the stored block", journal?.action === "create" && journal.table === "copyBlocks" && field(journal.after, "_id") === created.id, journal && { action: journal.action });

      const changed = await client.mutation(api.copyBlocks.upsert, { ...adminActor, key, kind: "list", items: ["one", "two"], label: "Rehearsal block", group: "rehearsal", expected: proposalComparableDocument("copyBlock", loaded), expectedRevision: 1, operationId: `${T14}-copy-2` });
      const reloaded = await client.query(api.copyBlocks.getByKey, { key });
      expect(S, "upsert with matching expected content changes kind and clears the stale body", changed.updated === true && changed.revision === 2 && reloaded?.kind === "list" && JSON.stringify(reloaded.items) === JSON.stringify(["one", "two"]) && reloaded.body === undefined, { changed, reloaded });
      const replay = await client.mutation(api.copyBlocks.upsert, { ...adminActor, key, kind: "markdown", body: "first body", label: "Rehearsal block", group: "rehearsal", operationId: op1 });
      expect(S, "replaying the create operationId returns the receipt and writes nothing", replay.replayed === true && replay.revision === 1 && (await client.query(api.copyBlocks.getByKey, { key }))?.kind === "list", replay);

      const journalRows = await count(pool, '"contentRevisions" WHERE "table" = $1 AND "key" = $2', ["copyBlocks", key]);
      const stale = await failure(() => client.mutation(api.copyBlocks.upsert, { ...adminActor, key, kind: "plain", body: "never", label: "Rehearsal block", group: "rehearsal", expected: proposalComparableDocument("copyBlock", loaded), operationId: `${T14}-copy-stale` }));
      expect(S, "stale expected content is refused with EDIT_CONFLICT", errorCode(stale) === "EDIT_CONFLICT", errorMessage(stale));
      const staleRevision = await failure(() => client.mutation(api.copyBlocks.upsert, { ...adminActor, key, kind: "plain", body: "never", label: "Rehearsal block", group: "rehearsal", expectedRevision: 1 }));
      expect(S, "stale expectedRevision is refused with EDIT_CONFLICT", errorCode(staleRevision) === "EDIT_CONFLICT", errorMessage(staleRevision));
      expect(S, "refused saves wrote no journal row and left the block unchanged", (await count(pool, '"contentRevisions" WHERE "table" = $1 AND "key" = $2', ["copyBlocks", key])) === journalRows && (await client.query(api.copyBlocks.getByKey, { key }))?.kind === "list");
      const editorSave = await failure(() => client.mutation(api.copyBlocks.upsert, { ...editorActor, key, kind: "plain", body: "never", label: "x", group: "y" }));
      expect(S, "editor-role actor is refused", isAuthRefusal(editorSave), errorMessage(editorSave));

      const removed = await client.mutation(api.copyBlocks.remove, { ...adminActor, key, expectedRevision: 2, operationId: `${T14}-copy-remove` });
      const [removal] = await selectDocuments(pool, "contentRevisions", { where: '"operationId" = $1', params: [`${T14}-copy-remove`] });
      expect(S, "remove deletes the block and journals a remove row", removed.removed === true && removed.revision === 3 && (await client.query(api.copyBlocks.getByKey, { key })) === null && removal?.action === "remove" && removal.after === null, removed);
    }

    // ------------------------------------------------------------------ warning banners
    {
      const S = "warningBanners";
      const key = `${T14}-banner`;
      purge("warningBannerPresets", '"key" = $1', key);
      purge("warningBannerRevisions", '"key" = $1', key);
      const preset = { key, tone: "caution" as const, icon: "lucide:wind", severityLabel: "Caution", headline: "Rehearsal headline", points: ["one", " two  spaced "], enabled: true, allSubstances: false };
      const state0 = await client.query(api.warningBanners.getEditorState, { ...adminActor, key });
      expect(S, "getEditorState reports no preset and a base hash before creation", state0.preset === null && typeof state0.baseHash === "string" && state0.history.length === 0, { baseHash: state0.baseHash });

      const c1 = `${T14}-banner-1`;
      const published = await client.mutation(api.warningBanners.upsertPreset, { ...adminActor, ...preset, enabledSlugs: [`${T14}-no-such-slug`], baseHash: state0.baseHash, changeId: c1, scope: "preset" });
      expect(S, "upsertPreset publishes and prunes slugs naming no article", published.updated === true && published.changeId === c1 && published.enabledSlugs.length === 0 && published.preset.points[1] === "two spaced", published);
      const listed = (await client.query(api.warningBanners.listPresets, {})).find((row) => row.key === key);
      expect(S, "listPresets (the public read) includes the preset without updatedBy", listed !== undefined && listed.headline === "Rehearsal headline" && !("updatedBy" in listed));
      const editorListed = (await client.query(api.warningBanners.listEditorPresets, adminActor)).find((row: { key: string }) => row.key === key);
      expect(S, "listEditorPresets carries the new base hash", editorListed?.baseHash === published.baseHash);
      const [revision1] = await selectDocuments(pool, "warningBannerRevisions", { where: '"changeId" = $1', params: [c1] });
      expect(S, "warningBannerRevisions row committed with the publish", revision1?.key === key && revision1.operation === "publish" && revision1.before === null && field(revision1.after, "headline") === "Rehearsal headline", revision1 && { operation: revision1.operation });

      const replay = await client.mutation(api.warningBanners.upsertPreset, { ...adminActor, ...preset, enabledSlugs: [`${T14}-no-such-slug`], baseHash: state0.baseHash, changeId: c1, scope: "preset" });
      expect(S, "replaying the changeId returns the recorded result without a second revision", replay.baseHash === published.baseHash && (await count(pool, '"warningBannerRevisions" WHERE "key" = $1', [key])) === 1, replay);

      const stale = await failure(() => client.mutation(api.warningBanners.upsertPreset, { ...adminActor, ...preset, headline: "never", enabledSlugs: [], baseHash: state0.baseHash, changeId: `${T14}-banner-stale`, scope: "preset" }));
      expect(S, "stale baseHash is refused with FIELD_CONFLICT", errorCode(stale) === "FIELD_CONFLICT", errorMessage(stale));
      expect(S, "refused publish wrote no revision row and left the preset unchanged", (await count(pool, '"warningBannerRevisions" WHERE "key" = $1', [key])) === 1 && (await client.query(api.warningBanners.getEditorState, { ...adminActor, key })).preset?.headline === "Rehearsal headline");

      const c2 = `${T14}-banner-2`;
      const changed = await client.mutation(api.warningBanners.upsertPreset, { ...adminActor, ...preset, headline: "Changed headline", enabledSlugs: [], baseHash: published.baseHash, changeId: c2, scope: "preset" });
      const state2 = await client.query(api.warningBanners.getEditorState, { ...adminActor, key, changeId: c2 });
      expect(S, "save with the current baseHash changes the preset and the editor state reloads it", changed.preset.headline === "Changed headline" && state2.preset?.headline === "Changed headline" && state2.baseHash === changed.baseHash && state2.history.length === 2 && state2.operation?.changeId === c2, { baseHash: state2.baseHash });

      const editorSave = await failure(() => client.mutation(api.warningBanners.upsertPreset, { ...editorActor, ...preset, headline: "never", enabledSlugs: [], baseHash: changed.baseHash, changeId: `${T14}-banner-editor`, scope: "preset" }));
      expect(S, "editor-role actor is refused", isAuthRefusal(editorSave), errorMessage(editorSave));

      const revisionId = state2.history.find((row: { changeId: string }) => row.changeId === c2)?.revisionId;
      const restored = await client.mutation(api.warningBanners.restorePreset, { ...adminActor, key, baseHash: changed.baseHash, changeId: `${T14}-banner-restore`, revisionId });
      expect(S, "restorePreset rolls back to the revision's before state and journals a restore", restored.preset?.headline === "Rehearsal headline" && (await client.query(api.warningBanners.getEditorState, { ...adminActor, key })).preset?.headline === "Rehearsal headline" && (await count(pool, '"warningBannerRevisions" WHERE "key" = $1 AND "operation" = $2', [key, "restore"])) === 1, restored);

      const removed = await client.mutation(api.warningBanners.removePreset, { ...adminActor, key, baseHash: restored.baseHash, changeId: `${T14}-banner-remove` });
      expect(S, "removePreset deletes the preset and journals a remove", removed.removed === true && !(await client.query(api.warningBanners.listPresets, {})).some((row) => row.key === key) && (await count(pool, '"warningBannerRevisions" WHERE "key" = $1 AND "operation" = $2', [key, "remove"])) === 1, removed);
    }

    // ------------------------------------------------------------------ quotes
    {
      const S = "quotes";
      const slug = `${T14}-quote-substance`;
      purge("quotes", '"slug" = $1', slug);
      expect(S, "getBySlugAndSection is null before the quote exists", (await client.query(api.quotes.getBySlugAndSection, { slug, section: "summary" })) === null);
      const created = await client.mutation(api.quotes.save, { ...adminActor, slug, section: "summary", content: "first quote", updatedBy: adminActor.actorEmail });
      expect(S, "save creates the quote", created.updated === false && (await client.query(api.quotes.getBySlugAndSection, { slug, section: "summary" }))?.content === "first quote", created);
      const changed = await client.mutation(api.quotes.save, { ...adminActor, slug, section: "summary", content: "changed quote" });
      expect(S, "save updates the same row and reload returns the change", changed.updated === true && changed.id === created.id && (await client.query(api.quotes.getBySlugAndSection, { slug, section: "summary" }))?.content === "changed quote", changed);
      await client.mutation(api.quotes.save, { ...adminActor, slug, section: "pharmacology", content: "pharmacology quote" });
      const availability = await client.query(api.quotes.getAvailabilityBySlug, { slug });
      expect(S, "getBySlug and getAvailabilityBySlug see both sections", (await client.query(api.quotes.getBySlug, { slug })).length === 2 && availability.summary?.available === true && availability.pharmacology?.available === true && availability.legality?.available === false, availability);
      const badSection = await failure(() => client.mutation(api.quotes.save, { ...adminActor, slug, section: "not-a-section", content: "never" }));
      expect(S, "unknown section is refused", badSection !== null, errorMessage(badSection));
      const editorSave = await failure(() => client.mutation(api.quotes.save, { ...editorActor, slug, section: "summary", content: "never" }));
      expect(S, "editor-role actor is refused", isAuthRefusal(editorSave), errorMessage(editorSave));
      const badKeySave = await failure(() => client.mutation(api.quotes.save, { apiKey: badKey, slug, section: "summary", content: "never" }));
      expect(S, "invalid API key is refused and the quote is unchanged", isAuthRefusal(badKeySave) && (await client.query(api.quotes.getBySlugAndSection, { slug, section: "summary" }))?.content === "changed quote", errorMessage(badKeySave));
      const deleted = await client.mutation(api.quotes.deleteBySlugAndSection, { ...adminActor, slug, section: "summary" });
      expect(S, "deleteBySlugAndSection removes one section only", deleted.deleted === true && (await client.query(api.quotes.getBySlug, { slug })).length === 1);
    }

    // ------------------------------------------------------------------ molecule overrides
    {
      const S = "moleculeOverrides";
      const slug = `${T15}-molecule`;
      purge("moleculeOverrides", '"slug" = $1', slug);
      const svg1 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>${slug} v1</title></svg>`;
      const svg2 = svg1.replace("v1", "v2");
      const molblock = "\n  rehearsal\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\nM  END\n";
      expect(S, "getBySlug is null before the override exists", (await client.query(api.moleculeOverrides.getBySlug, { slug })) === null);
      expect(S, "public adapter reports no depiction before the save", (await adapter.getPublicMoleculeBySlug(slug)) === null && (await adapter.getPublicMoleculeUpdatedAt(slug)) === null);

      const created = await client.mutation(api.moleculeOverrides.save, { ...adminActor, slug, svg: svg1, molblock, smiles: "C", boldBonds: [0], updatedBy: adminActor.actorEmail });
      const row = await client.query(api.moleculeOverrides.getBySlug, { slug });
      expect(S, "authorized save creates an editor-sourced row", created.updated === false && row?.svg === svg1 && row.source === "editor" && JSON.stringify(row.boldBonds) === "[0]", created);
      const index = await adapter.getPublicMoleculeOverrideSummaries();
      const indexed = index.find((entry) => entry.slug === slug);
      expect(S, "override index (PublicDataReadAdapter, DATA_BACKEND=postgres) lists the new depiction", indexed?.updatedAt === row?.updatedAt, indexed);
      const publicMolecule = await adapter.getPublicMoleculeBySlug(slug);
      expect(S, "public molecule read (PublicDataReadAdapter) serves the saved svg and revision", publicMolecule?.svg === svg1 && publicMolecule.updatedAt === row?.updatedAt && (await adapter.getPublicMoleculeUpdatedAt(slug)) === row?.updatedAt);
      expect(S, "getMetadataBySlug matches the public revision", (await client.query(api.moleculeOverrides.getMetadataBySlug, { slug }))?.updatedAt === row?.updatedAt);

      const changed = await client.mutation(api.moleculeOverrides.save, { ...adminActor, slug, svg: svg2, molblock });
      const row2 = await client.query(api.moleculeOverrides.getBySlug, { slug });
      expect(S, "re-save with new svg patches the row and advances the revision", changed.updated === true && changed.id === created.id && row2?.svg === svg2 && row2.updatedAt > (row?.updatedAt ?? "") && row2.boldBonds === undefined, { before: row?.updatedAt, after: row2?.updatedAt });
      expect(S, "public molecule read reflects the change", (await adapter.getPublicMoleculeBySlug(slug))?.svg === svg2);
      const unchangedSvg = await client.mutation(api.moleculeOverrides.save, { ...adminActor, slug, svg: svg2, molblock: `${molblock}\n` });
      expect(S, "identical svg keeps its published revision", unchangedSvg.updated === true && (await client.query(api.moleculeOverrides.getBySlug, { slug }))?.updatedAt === row2?.updatedAt);

      const editorSave = await failure(() => client.mutation(api.moleculeOverrides.save, { ...editorActor, slug, svg: svg1, molblock }));
      expect(S, "editor-role actor is refused", isAuthRefusal(editorSave) && /Admin access required/.test(errorMessage(editorSave)), errorMessage(editorSave));
      const badKeySave = await failure(() => client.mutation(api.moleculeOverrides.save, { apiKey: badKey, slug, svg: svg1, molblock }));
      expect(S, "invalid API key is refused", isAuthRefusal(badKeySave), errorMessage(badKeySave));
      const protectedApply = await client.mutation(api.moleculeOverrides.applyTemplateDepiction, { ...adminActor, slug, svg: svg1, molblock });
      expect(S, "template apply over a hand-edited row is reported as skipped", protectedApply.applied === false && protectedApply.reason === "protected-hand-edit", protectedApply);
      const row3 = await client.query(api.moleculeOverrides.getBySlug, { slug });
      expect(S, "refused and skipped writes left the row unchanged", row3?.svg === svg2 && row3.updatedAt === row2?.updatedAt && row3.source === "editor");
      const badRemove = await failure(() => client.mutation(api.moleculeOverrides.remove, { ...editorActor, slug }));
      expect(S, "editor-role remove is refused", isAuthRefusal(badRemove), errorMessage(badRemove));

      const removed = await client.mutation(api.moleculeOverrides.remove, { ...adminActor, slug });
      expect(S, "admin remove deletes the row and the public read returns null", removed.deleted === true && (await adapter.getPublicMoleculeBySlug(slug)) === null && !(await adapter.getPublicMoleculeOverrideSummaries()).some((entry) => entry.slug === slug), removed);
    }

    // ------------------------------------------------------------------ molecule class templates
    {
      const S = "moleculeClassTemplates";
      const classKey = `${T15}-class`;
      purge("moleculeClassTemplates", '"classKey" = $1', classKey);
      expect(S, "getByClassKey is null before the template exists", (await client.query(api.moleculeClassTemplates.getByClassKey, { classKey })) === null);
      const created = await client.mutation(api.moleculeClassTemplates.save, { ...adminActor, classKey, molblock: "template v1", boldBonds: [1, 2], updatedBy: adminActor.actorEmail });
      const row = await client.query(api.moleculeClassTemplates.getByClassKey, { classKey });
      expect(S, "save creates the template", created.updated === false && row?.molblock === "template v1" && JSON.stringify(row.boldBonds) === "[1,2]" && row.updatedAt === created.updatedAt, created);
      expect(S, "listKeys includes the template", (await client.query(api.moleculeClassTemplates.listKeys, {})).some((entry) => entry.classKey === classKey && entry.updatedAt === created.updatedAt));
      const changed = await client.mutation(api.moleculeClassTemplates.save, { ...adminActor, classKey, molblock: "template v2", boldBonds: [] });
      const row2 = await client.query(api.moleculeClassTemplates.getByClassKey, { classKey });
      expect(S, "re-save patches the row and stores empty boldBonds as absent", changed.updated === true && changed.id === created.id && row2?.molblock === "template v2" && row2.boldBonds === undefined, row2 && { boldBonds: row2.boldBonds });
      const editorSave = await failure(() => client.mutation(api.moleculeClassTemplates.save, { ...editorActor, classKey, molblock: "never" }));
      expect(S, "editor-role actor is refused and the template is unchanged", isAuthRefusal(editorSave) && (await client.query(api.moleculeClassTemplates.getByClassKey, { classKey }))?.molblock === "template v2", errorMessage(editorSave));
      const badClassKey = await failure(() => client.mutation(api.moleculeClassTemplates.save, { ...adminActor, classKey: "Not Valid", molblock: "never" }));
      expect(S, "invalid class key is refused", /Invalid chemical class key/.test(errorMessage(badClassKey)), errorMessage(badClassKey));
    }

    // ------------------------------------------------------------------ reagent tests
    {
      const S = "reagentTests";
      const slug = `${T15}-reagent`;
      purge("reagentTests", '"slug" = $1', slug);
      const snapshot1 = `${T15}-snapshot-1`;
      const snapshot2 = `${T15}-snapshot-2`;
      const data = (name: string) => ({
        substance: { name, aliases: ["alias"] },
        reagents: [{ reagent: "Marquis", colors: [{ id: 1, name: "Purple", simple: true, simpleColorId: 1 }], hint: "", isReacting: true }],
      });
      expect(S, "getBySlug is null before the import", (await client.query(api.reagentTests.getBySlug, { slug })) === null);
      const imported = await client.mutation(api.reagentTests.bulkUpsert, { apiKey, snapshotHash: snapshot1, importedAt: Date.now(), entries: [{ slug, data: data("Rehearsal substance") }] });
      expect(S, "authorized bulkUpsert creates the row", imported.created === 1 && imported.updated === 0 && imported.unchanged === 0, imported);
      const publicName = async () => field(field(await adapter.getPublicReagentTestBySlug(slug), "substance"), "name");
      expect(S, "public reagent read (PublicDataReadAdapter, DATA_BACKEND=postgres) serves the imported payload", (await publicName()) === "Rehearsal substance");
      const stats = await client.query(api.reagentTests.getSnapshotStats, { snapshotHash: snapshot1 });
      expect(S, "getSnapshotStats counts the imported row", stats.total === 1 && stats.matched === 1 && stats.unmatched === 0, stats);
      const repeat = await client.mutation(api.reagentTests.bulkUpsert, { apiKey, snapshotHash: snapshot1, importedAt: Date.now(), entries: [{ slug, data: data("ignored") }] });
      expect(S, "same snapshot hash is a no-op", repeat.unchanged === 1 && (await publicName()) === "Rehearsal substance", repeat);
      const updated = await client.mutation(api.reagentTests.bulkUpsert, { apiKey, snapshotHash: snapshot2, importedAt: Date.now(), entries: [{ slug, data: data("Rehearsal substance edited") }] });
      expect(S, "new snapshot hash updates the row and the public read reflects it", updated.updated === 1 && (await publicName()) === "Rehearsal substance edited", updated);
      const unauthorized = await failure(() => client.mutation(api.reagentTests.bulkUpsert, { apiKey: badKey, snapshotHash: `${T15}-snapshot-3`, importedAt: Date.now(), entries: [{ slug, data: null }] }));
      expect(S, "invalid API key is refused and the payload is unchanged", isAuthRefusal(unauthorized) && (await publicName()) === "Rehearsal substance edited", errorMessage(unauthorized));
      const nulled = await client.mutation(api.reagentTests.bulkUpsert, { apiKey, snapshotHash: `${T15}-snapshot-4`, importedAt: Date.now(), entries: [{ slug, data: null }] });
      expect(S, "a null payload round-trips as null (unmatched)", nulled.updated === 1 && (await client.query(api.reagentTests.getBySlug, { slug })) === null && (await client.query(api.reagentTests.getSnapshotStats, { snapshotHash: `${T15}-snapshot-4` })).unmatched === 1, nulled);
    }

  } finally {
    if (!keep) {
      if (createdAboutRow) purge("siteConfig", '"key" = $1', "about");
      if (createdBannerDisplayRow) purge("siteConfig", '"key" = $1', "safety-banner-display");
      for (const { table, where, params } of purges) {
        await pool.query(`DELETE FROM "documentIds" WHERE "_id" IN (SELECT "_id" FROM "${table}" WHERE ${where})`, params);
        await pool.query(`DELETE FROM "${table}" WHERE ${where}`, params);
      }
      for (const { table, id } of seeded.reverse()) await deleteDocument(pool, table, id);
    }
    const passed = checks.filter((c) => c.pass).length;
    const summary = {
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      run,
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
    await client.end();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
