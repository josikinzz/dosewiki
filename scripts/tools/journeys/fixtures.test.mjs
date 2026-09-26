import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FIXTURE_EMAIL,
  JOURNEY_ROLES,
  TOOL_STATES,
  buildChangelogFixture,
  buildReplicationFixture,
  createJourneyFixture,
  fixtureRevision,
  fixtureSession,
  TAG_ARTICLES_SEED,
} from "./fixtures.mjs";
import { assertLoopbackBase } from "./browserFixtures.mjs";

const get = (fixture, pathname, search = "") => fixture.respond({ method: "GET", pathname, search });
const post = (fixture, pathname, body) => fixture.respond({ method: "POST", pathname, body });

function loadRow(fixture, slug = "launch-post") {
  return get(fixture, "/api/dev/writing-article", `?slug=${slug}`).json?.article ?? null;
}

describe("journey fixtures", () => {
  it("builds the same records on every run", () => {
    const first = createJourneyFixture();
    const second = createJourneyFixture();
    assert.deepEqual(get(first, "/api/dev/writing-article").json, get(second, "/api/dev/writing-article").json);
    assert.deepEqual(loadRow(first), loadRow(second));
    assert.deepEqual(buildReplicationFixture(5), buildReplicationFixture(5));
  });

  it("gives every role a presentation session on an address no membership can match", () => {
    for (const role of JOURNEY_ROLES) {
      const session = fixtureSession(role);
      assert.equal(session.user.role, role);
      assert.match(session.user.email, /@localhost\.invalid$/);
      assert.deepEqual(get(createJourneyFixture({ role }), "/api/dev/screenshot-viewer/session").json, session);
    }
    // The same account as the viewer the server renders first, so a reload keeps recovery copies.
    const viewerSource = readFileSync(new URL("../../../lib/auth/devScreenshotViewer.ts", import.meta.url), "utf8");
    assert.match(viewerSource, new RegExp(`DEV_SCREENSHOT_VIEWER_EMAIL = "${FIXTURE_EMAIL.replace(/\./g, "\\.")}"`));
    assert.throws(() => fixtureSession("viewer"), /Unknown journey role/);
    assert.throws(() => createJourneyFixture({ state: "sleepy" }), /Unknown tool state/);
  });

  it("answers each tool state the way the routes do", () => {
    const status = (state, method, pathname, body) => {
      const fixture = createJourneyFixture({ state });
      if (method === "GET") return get(fixture, pathname).status;
      // The editor's save follows its read; a failed read leaves the revision it last knew.
      const known = fixture.writing.get("launch-post")?.baseRevision ?? fixtureRevision(0);
      const expectedRevision = loadRow(fixture)?.baseRevision ?? known;
      return post(fixture, pathname, { ...body, expectedRevision }).status;
    };
    const save = { slug: "launch-post", originalSlug: "launch-post", title: "Launch post two", kind: "blog", status: "draft" };
    const expected = {
      loaded: [200, 200, 200],
      empty: [200, 200, 200],
      failed: [500, 500, 200],
      conflicted: [200, 200, 409],
      frozen: [200, 200, 503],
      "session-expired": [401, 401, 401],
    };
    assert.deepEqual(Object.keys(expected), [...TOOL_STATES]);
    for (const state of TOOL_STATES) {
      const answers = [
        status(state, "GET", "/api/dev/writing-article"),
        status(state, "GET", "/api/dev/proposals"),
        status(state, "POST", "/api/dev/writing-article", save),
      ];
      assert.deepEqual(answers, expected[state], state);
    }
  });

  it("lists nothing in the empty state", () => {
    const fixture = createJourneyFixture({ state: "empty" });
    assert.deepEqual(get(fixture, "/api/dev/writing-article").json.articles, []);
    assert.deepEqual(get(fixture, "/api/dev/proposals").json.proposals, []);
    assert.deepEqual(get(fixture, "/api/dev/replications").json.rows, []);
  });

  it("answers the Home reads for every role, in the tool's state", () => {
    const loaded = createJourneyFixture({ role: "editor_translator" });
    assert.deepEqual(loaded.session.user.glossaryLocales, ["de", "nl", "ja"]);
    assert.equal(fixtureSession("editor").user.glossaryLocales, undefined);
    const work = get(loaded, "/api/dev/my-work").json;
    assert.deepEqual(work.drafts.map((draft) => draft.slug), ["launch-post", "dosage-tables-explained"]);
    assert.deepEqual(work.proposals.map((proposal) => proposal._id), ["journeyseed000001", "fixture-prop-about1", "fixture-prop-ket1"]);
    assert.equal(get(loaded, "/api/dev/translation-inbox", "?locale=de").json.total, 7);
    assert.equal(get(loaded, "/api/dev/invites").json.invites.filter((invite) => invite.status === "active").length, 2);
    assert.equal(get(loaded, "/api/dev/contributor-profile", "?key=ME").json.profile.key, "ME");

    const empty = createJourneyFixture({ role: "editor", state: "empty" });
    assert.deepEqual(get(empty, "/api/dev/my-work").json, { ok: true, drafts: [], proposals: [] });
    assert.deepEqual(get(empty, "/api/dev/invites").json.invites, []);
    assert.equal(get(createJourneyFixture({ state: "failed" }), "/api/dev/my-work").status, 500);
    assert.deepEqual(loaded.unhandled, []);
  });

  it("answers the About document and publishes it against its revision and content", () => {
    const fixture = createJourneyFixture();
    const read = get(fixture, "/api/dev/about").json;
    assert.equal(read.revision, 3);
    assert.equal(read.aggregates.compoundCount, 412);
    const expected = { aboutMarkdown: read.aboutMarkdown, aboutSubtitle: read.aboutSubtitle, founderProfileKeys: read.founderProfileKeys, translationCredits: read.translationCredits };
    const body = { ...expected, aboutSubtitle: "New subtitle.", expected, expectedRevision: 3, operationId: "op-1" };
    const saved = post(fixture, "/api/dev/about", body);
    assert.equal(saved.status, 200);
    assert.equal(saved.json.revision, 4);
    assert.equal(post(fixture, "/api/dev/about", body).json.replayed, true, "the same operation answers as it did");
    assert.equal(post(fixture, "/api/dev/about", { ...body, operationId: "op-2" }).status, 409, "the old revision is refused");
    assert.equal(get(fixture, "/api/dev/about").json.aboutSubtitle, "New subtitle.");

    assert.equal(post(createJourneyFixture({ role: "editor" }), "/api/dev/about", body).status, 403);
    assert.equal(post(createJourneyFixture({ state: "frozen" }), "/api/dev/about", body).status, 503);
    const conflicted = createJourneyFixture({ state: "conflicted" });
    assert.equal(post(conflicted, "/api/dev/about", body).status, 409);
    const newer = get(conflicted, "/api/dev/about").json;
    assert.match(newer.aboutSubtitle, /Edited by someone else\./);
    const newerExpected = { aboutMarkdown: newer.aboutMarkdown, aboutSubtitle: newer.aboutSubtitle, founderProfileKeys: newer.founderProfileKeys, translationCredits: newer.translationCredits };
    assert.equal(post(conflicted, "/api/dev/about", { ...body, expected: newerExpected, expectedRevision: newer.revision, operationId: "op-3" }).status, 200);
    assert.equal(get(createJourneyFixture({ state: "empty" }), "/api/dev/about").json.revision, undefined);
  });

  it("refuses a save made against an older revision, then takes one made against the newer", () => {
    const fixture = createJourneyFixture();
    const row = loadRow(fixture);
    const theirs = fixture.simulateConcurrentEdit("launch-post", { title: "Launch post theirs" });
    const stale = post(fixture, "/api/dev/writing-article", { slug: row.slug, originalSlug: row.slug, title: "Mine", expectedRevision: row.baseRevision });
    assert.equal(stale.status, 409);
    assert.equal(loadRow(fixture).title, "Launch post theirs");

    const saved = post(fixture, "/api/dev/writing-article", { slug: row.slug, originalSlug: row.slug, title: "Mine", expectedRevision: theirs });
    assert.equal(saved.status, 200);
    assert.notEqual(saved.json.revision, theirs);
    assert.equal(loadRow(fixture).title, "Mine");
  });

  it("lands someone else's save just before a conflicted record's first save, once", () => {
    const fixture = createJourneyFixture({ state: "conflicted" });
    const first = loadRow(fixture);
    assert.equal(loadRow(fixture).baseRevision, first.baseRevision, "reads alone move nothing");
    const save = (row) => post(fixture, "/api/dev/writing-article", { slug: row.slug, originalSlug: row.slug, title: "Mine", expectedRevision: row.baseRevision });
    assert.equal(save(first).status, 409);
    const newer = loadRow(fixture);
    assert.notEqual(newer.baseRevision, first.baseRevision);
    assert.match(newer.body_raw, /Edited by someone else\./);
    assert.equal(save(newer).status, 200);
  });

  it("holds a submitted proposal so it can be listed and reopened", () => {
    const fixture = createJourneyFixture({ role: "editor" });
    const row = loadRow(fixture);
    const submitted = post(fixture, "/api/dev/proposals", {
      payload: { writing: { slug: "launch-post", title: "Launch post two" } },
      summary: "Update blog post “Launch post two”",
      baselines: [{ kind: "writing", key: "launch-post", document: row }],
    });
    assert.equal(submitted.status, 200);
    const id = submitted.json.proposalId;

    const list = get(fixture, "/api/dev/proposals").json.proposals;
    // Newest first, above the seeded proposals (an editor sees only their own).
    assert.deepEqual(list.map((row) => row._id), [id, "journeyseed000001", "fixture-prop-about1", "fixture-prop-ket1", "fixture-prop-caf1"]);
    assert.ok(list.every((row) => row.isAuthor));
    assert.equal(list[0]._id, id);
    assert.equal(list[0].commentCount, 0);
    assert.equal("payload" in list[0], false);

    const detail = get(fixture, `/api/dev/proposals/${id}`).json.proposal;
    assert.equal(detail.summary, "Update blog post “Launch post two”");
    assert.deepEqual(detail.targets, [{ kind: "writing", key: "launch-post", baseHash: row.baseRevision }]);
    assert.equal(get(fixture, "/api/dev/proposals/count").json.submitted, 3);
    assert.equal(get(fixture, "/api/dev/proposals/missing").status, 404);
  });

  it("answers Change Review's decisions the way the review routes do", () => {
    const admin = createJourneyFixture({ role: "admin" });
    const list = get(admin, "/api/dev/proposals").json.proposals;
    assert.deepEqual([...new Set(list.map((row) => row.status))].sort(), ["applied", "changes_requested", "rejected", "reverted", "submitted", "superseded"]);
    assert.equal(get(admin, "/api/dev/proposals", "?status=submitted").json.proposals.every((row) => row.status === "submitted"), true);
    assert.equal(list.find((row) => row._id === "fixture-prop-about1").isAuthor, true);
    assert.equal("mine" in list[1], false);

    // A clean target publishes; a moved one comes back as changes requested; your own is refused.
    assert.equal(post(admin, "/api/dev/proposals/fixture-prop-lsd1/approve", {}).json.status, "applied");
    const returned = post(admin, "/api/dev/proposals/fixture-prop-mesc1/approve", {});
    assert.equal(returned.json.status, "changes_requested");
    assert.match(returned.json.conflictReason, /mescaline changed/);
    assert.equal(post(admin, "/api/dev/proposals/fixture-prop-about1/approve", {}).status, 409);
    assert.equal(post(admin, "/api/dev/proposals/fixture-prop-footer1/reject", { note: " " }).status, 400);
    assert.equal(post(admin, "/api/dev/proposals/fixture-prop-footer1/reject", { note: "Too long." }).json.status, "rejected");
    assert.equal(post(admin, "/api/dev/proposals/fixture-prop-dmt1/revert", {}).json.status, "reverted");
    assert.equal(post(admin, "/api/dev/proposals/fixture-prop-lsd1/comment", { text: "Live now." }).json.comment.text, "Live now.");
    assert.equal(get(admin, "/api/dev/proposals/fixture-prop-lsd1").json.proposal.comments.length, 3);

    const editor = createJourneyFixture({ role: "editor" });
    assert.equal(post(editor, "/api/dev/proposals/fixture-prop-ket1/reject", { note: "x" }).status, 403);
    assert.equal(get(editor, "/api/dev/review-recommendations").status, 403);
    assert.equal(post(createJourneyFixture({ state: "frozen" }), "/api/dev/proposals/fixture-prop-lsd1/approve", {}).status, 503);
    assert.equal(post(createJourneyFixture({ state: "conflicted" }), "/api/dev/proposals/fixture-prop-lsd1/approve", {}).json.status, "changes_requested");

    const recommendations = get(admin, "/api/dev/review-recommendations").json.recommendations;
    assert.deepEqual(recommendations.map((row) => row.stale), [false, false, false, true]);
    const outcome = post(admin, "/api/dev/review-recommendations", {
      items: [{ slug: "heroin", revision: "revheroin1" }, { slug: "fentanyl", revision: "revfentanyl1" }, { slug: "codeine", revision: "old" }],
    }).json;
    assert.deepEqual([outcome.approved, outcome.stale, outcome.missing], [["heroin"], ["fentanyl"], ["codeine"]]);
    assert.equal(get(admin, "/api/dev/review-recommendations").json.recommendations.length, 3);
    assert.deepEqual(admin.unhandled, []);
  });

  it("hands the same records to another person", () => {
    const fixture = createJourneyFixture({ role: "editor" });
    fixture.setRole("admin");
    assert.equal(get(fixture, "/api/dev/screenshot-viewer/session").json.user.role, "admin");
    assert.throws(() => fixture.setRole("viewer"), /Unknown journey role/);
  });

  it("keeps shell-wide reads loaded whatever the tool state", () => {
    const fixture = createJourneyFixture({ state: "session-expired" });
    assert.equal(get(fixture, "/api/editor/contributor-profiles").status, 200);
    assert.equal(get(fixture, "/api/dev/proposals/count").status, 200);
  });

  it("answers every other API request itself and records it, so nothing reaches the server", () => {
    const fixture = createJourneyFixture();
    assert.equal(get(fixture, "/api/editor/substances").status, 404);
    assert.equal(post(fixture, "/api/dev/no-such-route", {}).status, 501);
    assert.deepEqual(fixture.unhandled.map((entry) => `${entry.method} ${entry.pathname}`), ["GET /api/editor/substances", "POST /api/dev/no-such-route"]);
    // Documents and assets are the dev server's.
    assert.equal(get(fixture, "/dev/writing"), null);
  });

  it("moves to a new state mid-journey", () => {
    const fixture = createJourneyFixture();
    const row = loadRow(fixture);
    fixture.setState("session-expired");
    const refused = post(fixture, "/api/dev/writing-article", { slug: row.slug, originalSlug: row.slug, title: "x", expectedRevision: row.baseRevision });
    assert.equal(refused.status, 401);
    assert.equal(refused.json.error, "Authentication required.");
    assert.equal(fixture.requestsTo("POST", "/api/dev/writing-article").length, 1);
  });

  it("answers the change log feed newest first, capped by limit and by the route's 500", () => {
    const feed = (fixture, limit) => get(fixture, "/api/editor/changelog", `?limit=${limit}`);
    const loaded = feed(createJourneyFixture(), 100);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.json.length, 24);
    const times = loaded.json.map((row) => Date.parse(row.createdAt));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
    assert.ok(loaded.json.every((row) => !String(row.submittedBy ?? "").includes("@")));
    assert.equal(feed(createJourneyFixture({ changelogRows: 900 }), 100).json.length, 100);
    assert.equal(feed(createJourneyFixture({ changelogRows: 900 }), 9000).json.length, 500);
    assert.deepEqual(feed(createJourneyFixture({ state: "empty" }), 100).json, []);
    assert.equal(feed(createJourneyFixture({ state: "failed" }), 100).status, 500);
    assert.deepEqual(buildChangelogFixture(7), buildChangelogFixture(7));
  });

  it("answers the Banners reads and writes with the route's revision check", () => {
    const presets = (fixture) => get(fixture, "/api/dev/warning-banner").json.presets;
    const fixture = createJourneyFixture();
    const [first] = presets(fixture);
    assert.equal(presets(fixture).length, 5);
    assert.ok(get(fixture, "/api/dev/warning-banner/targets").json.items.some((item) => item.slug === "diazepam"));
    assert.equal(get(fixture, "/api/editor/banner-display").json.iconSize, 40);

    // A publish echoes the list minus slugs that name no article, and a stale revision is refused.
    const saved = post(fixture, "/api/dev/warning-banner", { ...first, enabledSlugs: ["heroin", "ghost"], changeId: "c1" });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.json.enabledSlugs, ["heroin"]);
    assert.equal(post(fixture, "/api/dev/warning-banner", { ...first, changeId: "c2" }).status, 409);
    // The answered write reconciles by change id.
    assert.equal(get(fixture, "/api/dev/warning-banner", `?key=${first.key}&changeId=c1`).json.operation.changeId, "c1");
    const removed = fixture.respond({ method: "DELETE", pathname: "/api/dev/warning-banner", body: { key: first.key, baseHash: saved.json.baseHash, changeId: "c3" } });
    assert.equal(removed.status, 200);
    assert.equal(presets(fixture).length, 4);

    // Someone else saves a conflicted preset just before the first publish; frozen and failed answer as the routes do.
    const conflicted = createJourneyFixture({ state: "conflicted" });
    assert.equal(post(conflicted, "/api/dev/warning-banner", { ...presets(conflicted)[0], changeId: "c4" }).status, 409);
    assert.equal(post(createJourneyFixture({ state: "frozen" }), "/api/dev/warning-banner/display", { iconSize: 50 }).status, 503);
    assert.equal(get(createJourneyFixture({ state: "failed" }), "/api/dev/warning-banner").status, 500);
    assert.deepEqual(presets(createJourneyFixture({ state: "empty" })), []);
  });

  it("answers the Playlists reads and writes with the route's ownership and updated_at checks", () => {
    const list = (fixture) => get(fixture, "/api/dev/replications/playlists").json.playlists;
    const admin = createJourneyFixture();
    assert.equal(list(admin).length, 5);
    assert.ok(list(admin).every((row) => row.editable));
    // An editor reads everyone's and edits their own; a contributor lists only their own.
    const editor = createJourneyFixture({ role: "editor" });
    assert.deepEqual(list(editor).filter((row) => !row.editable).map((row) => row.key), ["house-opener", "rivers-colour-set"]);
    assert.equal(list(createJourneyFixture({ role: "contributor" })).length, 3);
    assert.equal(get(createJourneyFixture({ role: "contributor" }), "/api/dev/replications/playlists/house-opener").status, 404);

    const one = get(admin, "/api/dev/replications/playlists/late-night-geometry").json.playlist;
    assert.equal(one.replication_slugs.length, 4);
    const saved = post(admin, "/api/dev/replications/playlists", { key: one.key, title: "Late", slugs: one.replication_slugs, expectedUpdatedAt: one.updated_at });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.json.playlist.pruned, ["retired-fixture-work"]);
    assert.equal(post(admin, "/api/dev/replications/playlists", { key: one.key, title: "Stale", slugs: [], expectedUpdatedAt: one.updated_at }).status, 409);
    assert.equal(post(admin, "/api/dev/replications/playlists/house-opener/owner", { ownerEmail: "river@localhost.invalid" }).json.owner_email, "river@localhost.invalid");
    assert.equal(admin.respond({ method: "DELETE", pathname: "/api/dev/replications/playlists/house-opener" }).status, 200);
    assert.equal(list(admin).length, 4);
    assert.equal(editor.respond({ method: "DELETE", pathname: "/api/dev/replications/playlists/house-opener" }).status, 403);

    // The work lookup: words, or the asked slugs that exist.
    assert.equal(get(admin, "/api/dev/replications/playlist-candidates", "?q=replication 07").json.candidates[0].slug, "fixture-replication-07");
    assert.deepEqual(get(admin, "/api/dev/replications/playlist-candidates", "?slugs=fixture-replication-01,ghost").json.candidates.map((card) => card.slug), ["fixture-replication-01"]);
    assert.ok(get(admin, "/api/dev/members").json.members.some((member) => member.bannedAt));

    const conflicted = createJourneyFixture({ state: "conflicted" });
    const first = get(conflicted, "/api/dev/replications/playlists/house-opener").json.playlist;
    assert.equal(post(conflicted, "/api/dev/replications/playlists", { ...first, slugs: first.replication_slugs, expectedUpdatedAt: first.updated_at }).status, 409);
    assert.equal(post(createJourneyFixture({ state: "frozen" }), "/api/dev/replications/playlists", { key: "x", title: "x", slugs: [], expectedUpdatedAt: null }).status, 503);
    assert.deepEqual(list(createJourneyFixture({ state: "empty" })), []);
    assert.deepEqual(admin.unhandled, []);
  });

  it("answers People: the roster with links, member writes, invite paging, create and revoke, and the profile link", () => {
    const admin = createJourneyFixture();
    const people = get(admin, "/api/dev/people").json;
    assert.ok(people.members.some((member) => member.role === "translator" && member.glossaryLocales.length > 0));
    assert.ok(people.links.some((link) => link.membershipEmail === "departed@localhost.invalid"));

    // Admins and the viewer's own row are refused, like Postgres refuses them.
    assert.equal(post(admin, "/api/dev/members/ban", { email: "lyrea@localhost.invalid" }).status, 403);
    assert.equal(post(admin, "/api/dev/members/ban", { email: "kayla@localhost.invalid" }).status, 200);
    assert.ok(get(admin, "/api/dev/people").json.members.find((member) => member.username === "kayla").bannedAt);
    assert.match(post(admin, "/api/dev/members/reset", { email: "kayla@localhost.invalid" }).json.resetPath, /^\/reset-password\?token=/);
    post(admin, "/api/dev/members/role", { email: "kayla@localhost.invalid", role: "editor_translator", glossaryLocales: ["nl"] });
    assert.deepEqual(get(admin, "/api/dev/members").json.members.find((member) => member.username === "kayla").glossaryLocales, ["nl"]);

    const first = get(admin, "/api/dev/invites").json;
    assert.equal(first.invites.length, 5);
    assert.equal(get(admin, "/api/dev/invites", `?cursor=${first.continuationCursor}`).json.invites.length, 2);
    const minted = post(admin, "/api/dev/invites", { role: "contributor", expiresInDays: 7, maxUses: 1, note: "Ada" }).json;
    assert.equal(get(admin, "/api/dev/invites").json.invites[0].id, minted.invite.id);
    assert.equal(post(admin, "/api/dev/invites", { role: "translator", glossaryLocales: [], expiresInDays: 7, maxUses: 1 }).status, 400);
    assert.equal(post(admin, `/api/dev/invites/${minted.invite.id}/revoke`, {}).status, 200);
    assert.equal(post(admin, `/api/dev/invites/${minted.invite.id}/revoke`, {}).status, 400);

    const zed = get(admin, "/api/dev/contributor-profile", "?key=ZED").json.profile;
    assert.equal(zed.membershipEmail, null);
    assert.equal(post(admin, "/api/dev/contributor-profile", { key: "ZED", expectedUpdatedAt: zed.updatedAt, membershipEmail: "kayla@localhost.invalid" }).status, 200);
    assert.ok(get(admin, "/api/dev/people").json.links.some((link) => link.key === "ZED"));
    assert.equal(post(admin, "/api/dev/contributor-profile", { key: "ZED", expectedUpdatedAt: zed.updatedAt, membershipEmail: null }).status, 409);

    assert.equal(post(createJourneyFixture({ state: "frozen" }), "/api/dev/members/ban", { email: "kayla@localhost.invalid" }).status, 503);
    assert.deepEqual(get(createJourneyFixture({ state: "empty" }), "/api/dev/people").json.links, []);
    assert.deepEqual(admin.unhandled, []);
  });

  it("answers the Contributors editor: credited work, ordering and the identity operations", () => {
    const admin = createJourneyFixture({ role: "admin" });
    const river = get(admin, "/api/dev/contributor-profile", "?key=RIVER").json;
    assert.deepEqual(river.profile.aliases, ["riverdraws", "r. okafor"]);
    assert.equal(river.works.length, 9);
    assert.equal(river.reports.length, 3);
    assert.ok(river.profile.replicationOrder.includes("fixture-replication-retired"));

    const saved = post(admin, "/api/dev/contributor-profile/ordering", { key: "RIVER", expectedRevision: river.profile.orderingRevision, replicationOrder: ["fixture-replication-05", "fixture-replication-retired"] });
    assert.deepEqual(saved.json.prunedReplicationSlugs, ["fixture-replication-retired"]);
    assert.equal(post(admin, "/api/dev/contributor-profile/ordering", { key: "RIVER", expectedRevision: river.profile.orderingRevision, replicationOrder: [] }).status, 409);

    assert.equal(post(admin, "/api/dev/contributor-profile/danger", { action: "delete", key: "ZED", confirmKey: "zedd" }).status, 400);
    assert.equal(post(admin, "/api/dev/contributor-profile/danger", { action: "delete", key: "RIVER", confirmKey: "river" }).status, 400);
    assert.equal(post(admin, "/api/dev/contributor-profile/danger", { action: "delete", key: "ZED", confirmKey: "zed" }).status, 200);
    assert.ok(!get(admin, "/api/editor/contributor-profiles").json.some((profile) => profile.key === "ZED"));
    const merged = post(admin, "/api/dev/contributor-profile/danger", { action: "merge", fromKey: "RIVER-SKETCHES", toKey: "RIVER", confirmKey: "river-sketches" }).json;
    assert.equal(merged.mergedInto, "RIVER");
    assert.equal(post(admin, "/api/dev/contributor-profile/danger", { action: "retarget", authorName: "Riv", contributorKey: "RIVER", confirmKey: "RIVER" }).status, 200);

    const editor = createJourneyFixture({ role: "editor" });
    const mira = get(editor, "/api/dev/contributor-profile", "?key=MIRA").json.profile;
    assert.equal(post(editor, "/api/dev/contributor-profile", { key: "MIRA", expectedUpdatedAt: mira.updatedAt, bio: "x" }).status, 403);
    assert.equal(post(editor, "/api/dev/contributor-profile/danger", { action: "delete", key: "ZED", confirmKey: "ZED" }).status, 403);
    assert.equal(post(createJourneyFixture({ state: "frozen" }), "/api/dev/contributor-profile/ordering", { key: "RIVER", reportOrder: [] }).status, 503);
    assert.deepEqual(admin.unhandled, []);
  });

  it("answers Copy: a metadata catalogue, keyed reads, and admin writes with the revision check", () => {
    const fixture = createJourneyFixture();
    const catalogue = get(fixture, "/api/editor/copy-blocks").json;
    assert.ok(catalogue.some((row) => row.key === "about-reuse-notice"));
    assert.ok(catalogue.every((row) => !("body" in row) && !("items" in row)));
    const read = get(fixture, "/api/dev/copy-block", "?key=about-reuse-notice").json;
    assert.equal(read.revision, 1);
    assert.match(read.document.body, /CC0/);
    assert.deepEqual(get(fixture, "/api/dev/copy-block", "?key=footer-supporter-prefix").json, { document: null, revision: 0 });

    const draft = { key: "about-reuse-notice", kind: "markdown", label: "Reuse notice", group: "About", body: "New words." };
    const stale = fixture.respond({ method: "POST", pathname: "/api/dev/copy-block", body: { ...draft, expected: read.document, expectedRevision: 0, operationId: "op-0" } });
    assert.equal(stale.status, 409);
    const saved = post(fixture, "/api/dev/copy-block", { ...draft, expected: read.document, expectedRevision: 1, operationId: "op-1" });
    assert.deepEqual([saved.status, saved.json.revision, saved.json.unchanged], [200, 2, false]);
    assert.equal(post(fixture, "/api/dev/copy-block", { ...draft, expected: read.document, expectedRevision: 1, operationId: "op-1" }).json.replayed, true);
    const removed = fixture.respond({ method: "DELETE", pathname: "/api/dev/copy-block", body: { key: draft.key, expected: { ...draft, revision: 2 }, expectedRevision: 2, operationId: "op-2" } });
    assert.deepEqual([removed.status, removed.json.removed], [200, true]);
    assert.equal(get(fixture, "/api/dev/copy-block", "?key=about-reuse-notice").json.document, null);

    assert.equal(post(createJourneyFixture({ role: "editor" }), "/api/dev/copy-block", { ...draft, expected: null, expectedRevision: 0 }).status, 403);
    assert.equal(post(createJourneyFixture({ state: "frozen" }), "/api/dev/copy-block", { ...draft, expected: null, expectedRevision: 0 }).status, 503);
    const conflicted = createJourneyFixture({ state: "conflicted" });
    const before = get(conflicted, "/api/dev/copy-block", "?key=about-reuse-notice").json;
    assert.equal(post(conflicted, "/api/dev/copy-block", { ...draft, expected: before.document, expectedRevision: before.revision }).status, 409);
    const after = get(conflicted, "/api/dev/copy-block", "?key=about-reuse-notice").json;
    assert.equal(post(conflicted, "/api/dev/copy-block", { ...draft, expected: after.document, expectedRevision: after.revision }).status, 200);
    assert.deepEqual(get(createJourneyFixture({ state: "empty" }), "/api/editor/copy-blocks").json, []);
  });

  it("serves the editor library, the Tags projection and one article, and takes the admin's commit", () => {
    const fixture = createJourneyFixture();
    const list = get(fixture, "/api/dev/editor-library").json;
    assert.equal(list.scope, "list");
    assert.equal(list.articles.length, TAG_ARTICLES_SEED.length);
    const registry = get(fixture, "/api/dev/editor-library", "?scope=tag-registry").json;
    assert.deepEqual(registry.entries.map((row) => row.slug), TAG_ARTICLES_SEED.map((row) => row.slug));
    assert.equal(get(fixture, "/api/dev/editor-library", "?scope=full").status, 400);
    assert.equal(get(fixture, "/api/dev/editor-library", "?slug=lsd").json.article.title, "LSD");
    assert.equal(get(fixture, "/api/dev/editor-library", "?slug=nothing").status, 404);
    assert.deepEqual(get(fixture, "/api/dev/index-layout", "?type=all").json.map((row) => row.type), ["psychoactive", "chemical", "mechanism"]);
    assert.equal(get(fixture, "/api/editor-config-health").json.canSaveToPostgres, true);

    const lsd = { ...get(fixture, "/api/dev/editor-library", "?slug=lsd").json.article, index_categories: ["Classic psychedelics"] };
    const saved = post(fixture, "/api/save-article", { articles: [lsd] });
    assert.equal(saved.status, 200);
    assert.deepEqual(get(fixture, "/api/dev/editor-library", "?slug=lsd").json.article.index_categories, ["Classic psychedelics"]);
    assert.equal(post(createJourneyFixture({ role: "editor" }), "/api/save-article", { articles: [lsd] }).status, 403);
    assert.equal(post(createJourneyFixture({ state: "frozen" }), "/api/save-article", { articles: [lsd] }).status, 503);

    // The list stays up when tool reads fail, so other tools keep their corpus.
    const failed = createJourneyFixture({ state: "failed" });
    assert.equal(get(failed, "/api/dev/editor-library").status, 200);
    assert.equal(get(failed, "/api/dev/editor-library", "?scope=tag-registry").status, 500);
    assert.equal(get(createJourneyFixture({ state: "empty" }), "/api/dev/editor-library", "?scope=tag-registry").json.entries.length, 0);

    // Someone else saves an article right after the editor's first whole read of it.
    const conflicted = createJourneyFixture({ state: "conflicted" });
    const first = get(conflicted, "/api/dev/editor-library", "?slug=diazepam").json.article.index_categories;
    const second = get(conflicted, "/api/dev/editor-library", "?slug=diazepam").json.article.index_categories;
    assert.equal(second.length, first.length + 1);
  });

  it("answers the Feedback queue as the route does: status, search, order, paging, one item, corrections", () => {
    const fixture = createJourneyFixture();
    const page = (search) => get(fixture, "/api/article-feedback/queue", search).json;

    const unresolved = page("?status=unresolved&order=oldest&limit=100");
    assert.ok(unresolved.feedback.every((row) => row.status === "new" || row.status === "reviewing"));
    assert.equal(unresolved.total, unresolved.counts.new + unresolved.counts.reviewing);
    assert.equal(page("?status=new&order=importance").feedback[0].importance, "critical");
    const newest = page("?status=all&order=newest").feedback.map((row) => row.created_at);
    assert.deepEqual(newest, [...newest].sort().reverse());
    const first = page("?status=all&limit=3");
    assert.equal(first.feedback.length, 3);
    assert.equal(first.nextCursor, "3");
    assert.equal(page("?status=all&limit=3&cursor=3").feedback[0].id, page("?status=all&limit=4").feedback[3].id);
    // The search reads the words, never the reader's contact columns.
    assert.equal(page("?status=all&q=serotonin").feedback.length, 1);
    assert.equal(page("?status=all&q=worried.friend").feedback.length, 0);

    assert.equal(get(fixture, "/api/article-feedback/fixture-af-5").json.feedback.status, "resolved");
    assert.equal(get(fixture, "/api/article-feedback/fixture-gone").status, 404);
    assert.equal(get(fixture, "/api/site-feedback/fixture-sf-2").json.feedback.category, "accessibility");

    const corrections = get(fixture, "/api/article-feedback/fixture-af-1/corrections").json;
    assert.deepEqual(corrections.corrections, []);
    assert.equal(corrections.candidates.proposals.length, 1);
    const linked = post(fixture, "/api/article-feedback/fixture-af-1/corrections", { change: { kind: "proposal", id: "fixture-prop-mesc1" } });
    assert.equal(linked.status, 200);
    assert.equal(get(fixture, "/api/article-feedback/fixture-af-1/corrections").json.corrections[0].state, "pending");
    assert.equal(post(fixture, "/api/article-feedback/fixture-af-1/corrections", { change: { kind: "proposal", id: "nope" } }).status, 400);

    const closed = post(fixture, "/api/article-feedback/fixture-af-1/status", { status: "resolved", outcome: "duplicate" });
    assert.equal(closed.json.feedback.decision_log.at(-1).outcome, "duplicate");
    assert.equal(post(createJourneyFixture({ state: "frozen" }), "/api/article-feedback/fixture-af-1/status", { status: "resolved" }).status, 503);
    assert.equal(get(createJourneyFixture({ state: "failed" }), "/api/article-feedback/queue", "?status=all").status, 500);
    assert.equal(get(createJourneyFixture({ state: "empty" }), "/api/site-feedback/queue", "?status=all").json.total, 0);
  });

  it("only accepts a loopback origin", () => {
    assert.equal(assertLoopbackBase("http://127.0.0.1:3100").port, "3100");
    assert.equal(assertLoopbackBase("http://localhost:3100").hostname, "localhost");
    assert.throws(() => assertLoopbackBase("https://dose.wiki"), /loopback/);
    assert.throws(() => assertLoopbackBase("http://127.0.0.1.example.com"), /loopback/);
  });
});
