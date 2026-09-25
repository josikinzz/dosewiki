import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FIXTURE_EMAIL,
  JOURNEY_ROLES,
  TOOL_STATES,
  buildReplicationFixture,
  createJourneyFixture,
  fixtureRevision,
  fixtureSession,
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
    assert.deepEqual(work.drafts.map((draft) => draft.slug), ["launch-post"]);
    assert.deepEqual(work.proposals.map((proposal) => proposal._id), ["journeyseed000001"]);
    assert.equal(get(loaded, "/api/dev/translation-inbox", "?locale=de").json.total, 7);
    assert.equal(get(loaded, "/api/dev/invites").json.invites.filter((invite) => invite.status === "active").length, 2);
    assert.equal(get(loaded, "/api/dev/contributor-profile", "?key=ME").json.profile.key, "ME");

    const empty = createJourneyFixture({ role: "editor", state: "empty" });
    assert.deepEqual(get(empty, "/api/dev/my-work").json, { ok: true, drafts: [], proposals: [] });
    assert.deepEqual(get(empty, "/api/dev/invites").json.invites, []);
    assert.equal(get(createJourneyFixture({ state: "failed" }), "/api/dev/my-work").status, 500);
    assert.deepEqual(loaded.unhandled, []);
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
    // Newest first, above the one seeded proposal.
    assert.deepEqual(list.map((row) => row._id), [id, "journeyseed000001"]);
    assert.equal(list[0]._id, id);
    assert.equal(list[0].commentCount, 0);
    assert.equal("payload" in list[0], false);

    const detail = get(fixture, `/api/dev/proposals/${id}`).json.proposal;
    assert.equal(detail.summary, "Update blog post “Launch post two”");
    assert.deepEqual(detail.targets, [{ kind: "writing", key: "launch-post", baseHash: row.baseRevision }]);
    assert.equal(get(fixture, "/api/dev/proposals/count").json.submitted, 2);
    assert.equal(get(fixture, "/api/dev/proposals/missing").status, 404);
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
    assert.equal(post(fixture, "/api/dev/about", {}).status, 501);
    assert.deepEqual(fixture.unhandled.map((entry) => `${entry.method} ${entry.pathname}`), ["GET /api/editor/substances", "POST /api/dev/about"]);
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

  it("only accepts a loopback origin", () => {
    assert.equal(assertLoopbackBase("http://127.0.0.1:3100").port, "3100");
    assert.equal(assertLoopbackBase("http://localhost:3100").hostname, "localhost");
    assert.throws(() => assertLoopbackBase("https://dose.wiki"), /loopback/);
    assert.throws(() => assertLoopbackBase("http://127.0.0.1.example.com"), /loopback/);
  });
});
