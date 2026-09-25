/**
 * Deterministic fixtures for browser journeys and screenshots of the `/dev`
 * shell.
 *
 * Everything here answers inside the test browser (see `browserFixtures.mjs`):
 * a request the fixture answers never reaches the dev server, so no private
 * row, credential or database is involved, and nothing in production code
 * knows these fixtures exist. The dev server still has to be the local
 * screenshot viewer (`lib/auth/devScreenshotViewer.ts`) for `/dev` documents
 * to render without an account; every `/api/*` route there keeps its own
 * session check, which is why the fixture answers those routes instead.
 *
 * One fixture is one browser session: a role (what the synthetic session
 * says), a tool state (how tool routes answer), and a small in-memory store,
 * so a journey can save, submit, reload and reopen against the same records.
 * Revisions, ids and timestamps are derived from counters and a fixed clock,
 * never from the real time or randomness.
 *
 * Pure module: no Playwright and no Node imports, so the unit tests drive it
 * directly.
 */

/** Roles the synthetic session can carry; mirrors `APP_ROLES` in `src/lib/auth/roles.ts`, minus `viewer`, which cannot open `/dev`. */
export const JOURNEY_ROLES = Object.freeze(["admin", "editor_translator", "editor", "translator", "contributor"]);

/**
 * How tool routes answer:
 * - `loaded`: records exist, writes succeed against the revision check.
 * - `empty`: no records; writes create them.
 * - `failed`: reads answer 500.
 * - `conflicted`: someone else saves each record just before the editor's
 *   first save of it lands, so that save is refused by the revision check
 *   (409); a save made after loading the newer version goes through.
 * - `frozen`: reads work, writes answer 503 with the write-freeze code.
 * - `session-expired`: tool reads and writes answer 401, as they do once the
 *   Auth.js cookie has lapsed under an open page.
 */
export const TOOL_STATES = Object.freeze(["loaded", "empty", "failed", "conflicted", "frozen", "session-expired"]);

/** The fixed clock every fixture timestamp is derived from. */
export const FIXTURE_EPOCH = Date.parse("2026-01-15T12:00:00.000Z");

/**
 * The viewer's own address (`DEV_SCREENSHOT_VIEWER_EMAIL`); the `.invalid`
 * domain can never match a stored membership (RFC 2606). Every role shares it
 * on purpose: the server renders the viewer's session before the fixture's
 * replaces it, and browser recovery copies are scoped to the account, so a
 * second address would make each reload look like another account and drop
 * the copy a journey is about to recover.
 */
export const FIXTURE_EMAIL = "screenshot-viewer@localhost.invalid";

/** The session the viewer's `SessionProvider` reads; presentation only, like the viewer's own. */
export function fixtureSession(role, now = FIXTURE_EPOCH) {
  if (!JOURNEY_ROLES.includes(role)) throw new Error(`Unknown journey role: ${role}.`);
  const translates = role === "translator" || role === "editor_translator";
  return {
    user: {
      email: FIXTURE_EMAIL,
      name: `Journey ${role.replace(/_/g, " ")}`,
      role,
      // The languages a translating role reviews, so Home and Glossary have something to show.
      ...(translates ? { glossaryLocales: [...FIXTURE_GLOSSARY_LOCALES] } : {}),
    },
    expires: new Date(now + 60 * 60 * 1000).toISOString(),
  };
}

/** The languages a translating fixture role holds. */
export const FIXTURE_GLOSSARY_LOCALES = Object.freeze(["de", "nl", "ja"]);

/** Review inbox totals per fixture language: one busy, one empty, one small. */
const TRANSLATION_INBOX_TOTALS = Object.freeze({ de: 7, nl: 0, ja: 2 });

/** Invite codes for the admin's Home and People: two open, one expired. */
function seedInvites() {
  const day = 86_400_000;
  const at = (offset) => new Date(FIXTURE_EPOCH + offset * day).toISOString();
  const invite = (id, role, created, expires, status, note) => ({
    id, role, createdBy: FIXTURE_EMAIL, createdAt: at(created), expiresAt: at(expires),
    maxUses: 1, redemptions: [], status, ...(note ? { note } : {}),
  });
  return [
    invite("fixture-invite-1", "editor", -2, 5, "active", "For the fixture reviewer"),
    invite("fixture-invite-2", "translator", -1, 13, "active"),
    invite("fixture-invite-3", "contributor", -20, -13, "expired", "Old batch"),
  ];
}

/** Another admin, so the Inbox can show an item someone else holds. */
export const FIXTURE_OTHER_ADMIN = "other-admin@localhost.invalid";

/**
 * What waits on an admin in the Inbox: trip reports, article, site and
 * glossary feedback, citation articles and one expired claim. The waiting
 * proposal comes from `seedProposal`. Every source is present so each row
 * shape, urgency and claim state renders.
 */
export function seedInbox() {
  const hour = 3_600_000;
  const at = (hours) => new Date(FIXTURE_EPOCH - hours * hour).toISOString();
  const logged = (actor, hours, from, to) => [{ at: at(hours), actor, from, to }];
  return {
    trip: [
      {
        id: "fixture-trip-1", status: "submitted", schema_version: 1, report: {}, title: "A quiet evening with a fixture",
        author_name: "Fixture author", substance_names: ["Psilocybin"], may_contact: false, publish_consent: true,
        age_confirmed: true, honeypot_triggered: false, created_at: at(70), updated_at: at(70),
      },
      {
        id: "fixture-trip-2", status: "reviewing", schema_version: 1, report: {}, title: "Fixture festival notes, part two",
        author_name: "", substance_names: ["MDMA", "Ketamine"], may_contact: true, publish_consent: false,
        age_confirmed: true, honeypot_triggered: false, created_at: at(200), updated_at: at(20),
        reviewed_by: FIXTURE_OTHER_ADMIN, decision_log: logged(FIXTURE_OTHER_ADMIN, 20, "submitted", "reviewing"),
      },
    ],
    article: [
      {
        id: "fixture-af-1", status: "new", schema_version: 1, substance_slug: "mescaline", substance_title: "Mescaline",
        category: "inaccurate", importance: "high", details: "The oral duration looks off; most sources give 10 to 12 hours.",
        honeypot_triggered: false, created_at: at(120), updated_at: at(120),
      },
      {
        id: "fixture-af-2", status: "reviewing", schema_version: 1, substance_slug: "lsd", substance_title: "LSD",
        category: "source", importance: "normal", details: "A 2025 study on microdosing could be cited in Pharmacology.",
        source_url: "https://example.invalid/study", honeypot_triggered: false, created_at: at(300), updated_at: at(10),
        reviewed_by: FIXTURE_EMAIL, decision_log: logged(FIXTURE_EMAIL, 10, "new", "reviewing"),
      },
    ],
    site: [
      {
        id: "fixture-sf-1", status: "new", schema_version: 1, category: "technical", urgency: "critical",
        page: "/search", details: "Search returns nothing on a phone.", honeypot_triggered: false,
        created_at: at(5), updated_at: at(5),
      },
    ],
    glossary: [
      {
        id: "fixture-gf-1", status: "new", locale: "de", term: "Toleranz", target: "Toleranz", version: "v1",
        alternative: "Gewöhnung", details: "Reads oddly in the dosage context.", created_at: at(90),
      },
    ],
    citations: [
      {
        slug: "lsd", articleId: 1, totalRows: 14, supportedCount: 6, needsSourceCount: 3, needsReviewCount: 2,
        approvedCount: 3, rejectedCount: 0, blockingCount: 2, updatedAt: at(48),
      },
      {
        slug: "mdma", articleId: 2, totalRows: 8, supportedCount: 5, needsSourceCount: 0, needsReviewCount: 1,
        approvedCount: 2, rejectedCount: 0, blockingCount: 0, updatedAt: at(400),
      },
    ],
    claims: [
      // Held by another admin and left untouched for over a day: reads as unclaimed.
      { source: "citations", item_id: "mdma", claimed_by: FIXTURE_OTHER_ADMIN, claimed_at: at(60), expired: true },
      // The seeded proposal, held by another admin: offers Take over.
      { source: "proposals", item_id: "journeyseed000001", claimed_by: FIXTURE_OTHER_ADMIN, claimed_at: at(2), expired: false },
    ],
  };
}

/** A 64-character hex revision from a counter, so every run names the same revisions. */
export function fixtureRevision(n) {
  return n.toString(16).padStart(64, "0");
}

const FROZEN_ERROR = Object.freeze({
  error: "Data writes are frozen (DATA_WRITES_FROZEN): the fixture refused this write before any statement ran.",
  code: "DATA_WRITES_FROZEN",
});
const AUTH_ERROR = Object.freeze({ error: "Authentication required." });
const REVISION_CONFLICT = "Someone saved this article after you loaded it.";

export const WRITING_SEED = Object.freeze([
  {
    slug: "launch-post",
    title: "Launch post",
    kind: "blog",
    status: "draft",
    bodyFormat: "markdown",
    body_raw: "Post.",
    teaser: "What changed at launch.",
    tags: ["news"],
    authorProfileKeys: [],
  },
  {
    slug: "field-notes",
    title: "Field notes",
    kind: "article",
    status: "published",
    bodyFormat: "markdown",
    body_raw: "Notes from the field.",
    teaser: "",
    tags: [],
    authorProfileKeys: [],
  },
]);

/** An empty directory keeps corpus tools out of the error boundary without inventing profile rows. */
export const CONTRIBUTOR_PROFILES_SEED = Object.freeze([]);

/**
 * Replication Studio rows with no private field and no remote media: slugs,
 * titles and effects are synthetic, and thumbnails are left empty so nothing
 * is fetched from a media host.
 */
export function buildReplicationFixture(count = 24) {
  const effects = ["drifting", "color-enhancement", "geometry", "tracers"];
  const rows = Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(2, "0");
    const effect = effects[index % effects.length];
    return {
      id: `fixture-${n}`,
      slug: `fixture-replication-${n}`,
      title: `Fixture replication ${n}`,
      artist: `Fixture artist ${(index % 5) + 1}`,
      artist_url: null,
      role: "replication",
      type: index % 6 === 5 ? "video" : "image",
      effect_slug: effect,
      effect_name: titleCase(effect),
      effect_tags: [effect],
      credit_line: `Fixture artist ${(index % 5) + 1}`,
      rights_status: "permission",
      url: null,
      thumbnail_url: null,
      preview_url: null,
      format: index % 6 === 5 ? "mp4" : "png",
      duration: null,
      file_size: null,
      created_at: new Date(FIXTURE_EPOCH - index * 86_400_000).toISOString(),
    };
  });
  return { rows, effects: effects.map((slug) => ({ slug, name: titleCase(slug) })).sort((a, b) => a.slug.localeCompare(b.slug)) };
}

function titleCase(slug) {
  return slug.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

/** One waiting proposal, so the Queue has a record to show before a journey submits its own. */
function seedProposal(row, role) {
  const at = new Date(FIXTURE_EPOCH - 3_600_000).toISOString();
  return {
    _id: "journeyseed000001",
    proposerName: "Journey editor",
    // Editors see only their own submissions; an admin sees everyone's.
    isAuthor: role !== "admin",
    createdAt: at,
    updatedAt: at,
    status: "submitted",
    targets: [{ kind: "writing", key: row.slug, baseHash: row.baseRevision }],
    summary: `Update article “${row.title}”`,
    diff: `# writing: ${row.slug}\n- teaser: A shorter teaser.\n`,
    comparisonMode: "submitted",
    comments: [],
    liveHashes: [{ kind: "writing", key: row.slug, hash: row.baseRevision }],
    payload: { writing: { ...structuredClone(row), teaser: "A shorter teaser." } },
  };
}

function json(status, body) {
  return { status, json: body };
}

/**
 * One browser session's fixture. `respond` answers a request the way the
 * matching route would, or returns null for a request the fixture does not
 * own (documents and static assets, which the dev server serves).
 */
export function createJourneyFixture({ role = "admin", state = "loaded", replicationRows = 24 } = {}) {
  if (!JOURNEY_ROLES.includes(role)) throw new Error(`Unknown journey role: ${role}.`);
  if (!TOOL_STATES.includes(state)) throw new Error(`Unknown tool state: ${state}.`);

  let revisionCounter = 0x100;
  let proposalCounter = 0;
  let clock = FIXTURE_EPOCH;
  const nextRevision = () => fixtureRevision(++revisionCounter);
  const tick = () => new Date((clock += 60_000)).toISOString();

  const writing = new Map(
    (state === "empty" ? [] : WRITING_SEED).map((row, index) => [
      row.slug,
      { ...structuredClone(row), baseRevision: nextRevision(), creationTime: FIXTURE_EPOCH - index * 1000 },
    ]),
  );
  const proposals = state === "empty" ? [] : [seedProposal(writing.get("field-notes"), role)];
  const replications = buildReplicationFixture(state === "empty" ? 0 : replicationRows);
  const inbox = state === "empty"
    ? { trip: [], article: [], site: [], glossary: [], citations: [], claims: [] }
    : seedInbox();
  /** Records someone else already saved over, so a `conflicted` store bumps each once. */
  const contested = new Set();

  const fixture = {
    role,
    state,
    session: fixtureSession(role),
    /** Every request the fixture answered, in order, with what it answered. */
    requests: [],
    /** Requests nothing owns; a journey fails when a write lands here. */
    unhandled: [],
    writing,
    proposals,

    /** Another editor saves `slug` now: its revision moves and `patch` lands. */
    simulateConcurrentEdit(slug, patch) {
      const row = writing.get(slug);
      if (!row) throw new Error(`No writing row ${slug} to edit concurrently.`);
      Object.assign(row, patch, { baseRevision: nextRevision() });
      return row.baseRevision;
    },

    /** Another person on the same records: the next browser context signs in as `next`. */
    setRole(next) {
      fixture.role = next;
      fixture.session = fixtureSession(next);
    },

    /** The tool state from now on; a journey moves to `session-expired` mid-edit. */
    setState(next) {
      if (!TOOL_STATES.includes(next)) throw new Error(`Unknown tool state: ${next}.`);
      fixture.state = next;
    },

    /** The request log, filtered to one method and path. */
    requestsTo(method, pathname) {
      return fixture.requests.filter((entry) => entry.method === method && entry.pathname === pathname);
    },

    respond(request) {
      const answer = route(request);
      if (answer) fixture.requests.push({ ...request, status: answer.status, response: answer.json });
      return answer;
    },
  };

  const toolRead = (answer) => {
    if (fixture.state === "session-expired") return json(401, AUTH_ERROR);
    if (fixture.state === "failed") return json(500, { error: "The fixture server could not load this. Try again." });
    return answer();
  };
  const toolWrite = (answer) => {
    if (fixture.state === "session-expired") return json(401, AUTH_ERROR);
    if (fixture.state === "frozen") return json(503, FROZEN_ERROR);
    return answer();
  };

  function writingList() {
    return [...writing.values()].map(({ slug, title, kind, status, creationTime }) => ({ slug, title, kind, status, creationTime }));
  }

  function readWritingRow(slug) {
    const row = writing.get(slug);
    if (!row) return json(200, { ok: true, article: null });
    return json(200, { ok: true, article: structuredClone(row) });
  }

  function saveWritingRow(body) {
    const key = body.originalSlug ?? body.slug;
    const existing = key ? writing.get(key) : undefined;
    // Someone else's save lands just before the editor's first one.
    if (fixture.state === "conflicted" && existing && !contested.has(key)) {
      contested.add(key);
      fixture.simulateConcurrentEdit(key, { body_raw: `${existing.body_raw ?? ""} Edited by someone else.`.trim() });
    }
    const currentRevision = existing?.baseRevision ?? fixtureRevision(0);
    // The route's revision check: a save made against an older version is refused.
    if (body.expectedRevision !== currentRevision) return json(409, { error: REVISION_CONFLICT });
    const revision = nextRevision();
    const row = {
      slug: body.slug,
      title: body.title,
      kind: body.kind ?? existing?.kind ?? "article",
      status: body.status ?? "draft",
      bodyFormat: body.bodyFormat ?? "markdown",
      body_raw: body.body ?? "",
      teaser: body.teaser ?? "",
      tags: body.tags ?? [],
      authorProfileKeys: body.authorProfileKeys ?? [],
      publicationDate: body.publicationDate,
      baseRevision: revision,
      creationTime: existing?.creationTime ?? clock,
    };
    if (key && key !== body.slug) writing.delete(key);
    writing.set(body.slug, row);
    return json(200, { ok: true, slug: body.slug, revision });
  }

  function proposalSummary(proposal) {
    const { diff: _diff, comments, liveHashes: _liveHashes, payload: _payload, ...summary } = proposal;
    return { ...summary, commentCount: comments.length };
  }

  function submitProposal(body) {
    const id = `journeyproposal${String(++proposalCounter).padStart(6, "0")}`;
    const baselines = Array.isArray(body.baselines) ? body.baselines : [];
    const targets = baselines.map((baseline) => ({
      kind: baseline.kind,
      key: baseline.key,
      baseHash: baseline.document?.baseRevision ?? fixtureRevision(0),
    }));
    const at = tick();
    const writingPayload = body.payload?.writing;
    proposals.unshift({
      _id: id,
      proposerName: fixture.session.user.name,
      isAuthor: true,
      createdAt: at,
      updatedAt: at,
      status: "submitted",
      targets,
      summary: String(body.summary ?? "Untitled proposal"),
      diff: writingPayload ? `# writing: ${writingPayload.slug}\n- title: ${writingPayload.title}\n` : "",
      comparisonMode: "submitted",
      comments: [],
      liveHashes: targets.map((target) => ({ kind: target.kind, key: target.key, hash: writing.get(target.key)?.baseRevision ?? target.baseHash })),
      payload: body.payload,
    });
    return json(200, { ok: true, proposalId: id });
  }

  function proposalDetail(id) {
    const proposal = proposals.find((row) => row._id === id);
    if (!proposal) return json(404, { error: "That proposal does not exist or you cannot see it." });
    const { payload: _payload, ...detail } = proposal;
    return json(200, { proposal: structuredClone(detail) });
  }

  function route({ method, pathname, search = "", body }) {
    const params = new URLSearchParams(search);
    const upper = method.toUpperCase();

    // The viewer's client session: the fixture's role, whatever the server built.
    if (pathname === "/api/dev/screenshot-viewer/session") return json(200, fixture.session);
    if (pathname.startsWith("/api/dev/screenshot-viewer/")) return json(200, {});
    if (pathname === "/api/csp-report") return { status: 204, json: null };

    // Shell-wide reads answer as loaded in every state, so a tool's state is
    // what a journey sees rather than the whole shell failing around it.
    if (upper === "GET") {
      if (pathname === "/api/editor/contributor-profiles") return json(200, structuredClone(CONTRIBUTOR_PROFILES_SEED));
      if (pathname === "/api/dev/proposals/count") return json(200, { ok: true, submitted: proposals.filter((row) => row.status === "submitted").length });
      if (pathname === "/api/dev/trip-reports/needs-review-count") return json(200, { ok: true, count: 0 });
      if (pathname === "/api/feedback/pending-count") return json(200, { ok: true, article: 0, site: 0, total: 0 });
      if (pathname === "/api/citation-evidence/open-count") return json(200, { ok: true, count: 0 });
      if (pathname === "/api/glossary-feedback/pending-count") return json(200, { ok: true, total: 0 });
      if (pathname === "/api/dev/review-recommendations") return json(200, { recommendations: [] });
    }

    if (pathname === "/api/dev/writing-article") {
      if (upper === "GET") {
        const slug = params.get("slug");
        return toolRead(() => slug ? readWritingRow(slug) : json(200, { ok: true, articles: writingList() }));
      }
      if (upper === "POST") return toolWrite(() => saveWritingRow(body ?? {}));
    }

    if (pathname === "/api/dev/proposals") {
      if (upper === "GET") return toolRead(() => json(200, { proposals: proposals.map(proposalSummary) }));
      if (upper === "POST") return toolWrite(() => submitProposal(body ?? {}));
    }
    const proposalMatch = /^\/api\/dev\/proposals\/([^/]+)$/.exec(pathname);
    if (proposalMatch && upper === "GET") return toolRead(() => proposalDetail(decodeURIComponent(proposalMatch[1])));

    // Home: the member's own drafts and proposals, invites, language inboxes, own profile.
    if (pathname === "/api/dev/my-work" && upper === "GET") {
      return toolRead(() => json(200, {
        ok: true,
        drafts: [...writing.values()]
          .filter((row) => row.status === "draft")
          .map((row) => ({ slug: row.slug, title: row.title, updatedAt: new Date(row.creationTime).toISOString() })),
        proposals: proposals.filter((row) => row.isAuthor && (row.status === "submitted" || row.status === "changes_requested")).map(proposalSummary),
      }));
    }
    if (pathname === "/api/dev/invites" && upper === "GET") {
      return toolRead(() => json(200, { ok: true, continuationCursor: null, invites: fixture.state === "empty" ? [] : seedInvites() }));
    }
    if (pathname === "/api/dev/translation-inbox" && upper === "GET") {
      const locale = params.get("locale") ?? "";
      const total = fixture.state === "empty" ? 0 : (TRANSLATION_INBOX_TOTALS[locale] ?? 0);
      return toolRead(() => json(200, { ok: true, locale, items: [], total, counts: {} }));
    }
    if (pathname === "/api/dev/contributor-profile" && upper === "GET") {
      const key = params.get("key") ?? "";
      return toolRead(() => json(200, {
        ok: true,
        profile: {
          key,
          displayName: fixture.session.user.name,
          // Name and bio done in the loaded state, only the name in the empty one.
          bio: fixture.state === "empty" ? "" : "Writes field notes.",
          links: [],
          avatarUrl: null,
          storedAvatarUrl: null,
        },
        works: [],
        reports: [],
      }));
    }

    // Home and My reports: the member's own trip report submissions and published reports.
    if (pathname === "/api/dev/trip-reports/mine/submissions" && upper === "GET") {
      const at = (hours) => new Date(FIXTURE_EPOCH - hours * 3_600_000).toISOString();
      return toolRead(() => json(200, {
        ok: true,
        submissions: fixture.state === "empty" ? [] : [
          { id: "fixture-submission-1", title: "A quiet evening with a fixture", status: "reviewing", submitted_at: at(30) },
          { id: "fixture-submission-2", title: "Fixture festival notes", status: "published", submitted_at: at(400), decided_at: at(300), report_slug: "fixture-festival-notes" },
        ],
      }));
    }
    if (pathname === "/api/dev/trip-reports/mine" && upper === "GET") {
      return toolRead(() => json(200, {
        ok: true,
        reports: fixture.state === "empty" ? [] : [
          { id: "fixture-report-1", slug: "fixture-festival-notes", title: "Fixture festival notes", createdAt: FIXTURE_EPOCH - 300 * 3_600_000 },
        ],
      }));
    }

    // Inbox: every intake queue it reads, plus claims, answered from one in-memory store.
    if (pathname === "/api/dev/inbox/claims") {
      if (upper === "GET") return toolRead(() => json(200, { ok: true, claims: structuredClone(inbox.claims) }));
      if (upper === "POST") {
        return toolWrite(() => {
          const { action, source, id } = body ?? {};
          inbox.claims = inbox.claims.filter((entry) => entry.source !== source || entry.item_id !== id);
          if (action === "release") return json(200, { ok: true, released: true });
          const claim = { source, item_id: id, claimed_by: fixture.session.user.email, claimed_at: tick() };
          inbox.claims.push(claim);
          return json(200, { ok: true, claim });
        });
      }
    }
    if (pathname === "/api/trip-report-submissions/queue" && upper === "GET") {
      return toolRead(() => json(200, { ok: true, submissions: structuredClone(inbox.trip) }));
    }
    for (const [prefix, key] of [["article-feedback", "article"], ["site-feedback", "site"]]) {
      if (pathname === `/api/${prefix}/queue` && upper === "GET") {
        const status = params.get("status") ?? "all";
        const rows = inbox[key].filter((row) => status === "all" || row.status === status);
        const counts = { new: 0, reviewing: 0, resolved: 0, rejected: 0, spam: 0 };
        for (const row of inbox[key]) counts[row.status] += 1;
        return toolRead(() => json(200, { ok: true, feedback: structuredClone(rows), counts, nextCursor: null, total: rows.length }));
      }
    }
    if (pathname === "/api/glossary-feedback/queue" && upper === "GET") {
      return toolRead(() => json(200, { ok: true, locale: "de", locales: ["de"], feedback: structuredClone(inbox.glossary) }));
    }
    if (/^\/api\/article-feedback\/[^/]+\/corrections$/.test(pathname) && upper === "GET") {
      return toolRead(() => json(200, { ok: true, corrections: [], candidates: { proposals: [], revisions: [] } }));
    }
    if (pathname === "/api/citation-evidence/queue" && upper === "GET") {
      return toolRead(() => json(200, { ok: true, queue: structuredClone(inbox.citations) }));
    }
    const statusMatch = /^\/api\/(trip-report-submissions|article-feedback|site-feedback|glossary-feedback)\/([^/]+)\/status$/.exec(pathname);
    if (statusMatch && upper === "POST") {
      return toolWrite(() => {
        const key = { "trip-report-submissions": "trip", "article-feedback": "article", "site-feedback": "site", "glossary-feedback": "glossary" }[statusMatch[1]];
        const row = inbox[key].find((entry) => entry.id === decodeURIComponent(statusMatch[2]));
        if (!row) return json(404, { error: "That item is gone." });
        const to = body?.status;
        const actor = fixture.session.user.email;
        row.decision_log = [...(row.decision_log ?? []), { at: tick(), actor, from: row.status, to, ...(body?.notes || body?.note ? { note: body.notes ?? body.note } : {}) }];
        Object.assign(row, { status: to, reviewed_by: actor });
        return json(200, key === "trip" ? { ok: true, submission: structuredClone(row) } : { ok: true, feedback: structuredClone(row) });
      });
    }

    if (pathname === "/api/dev/replications" && upper === "GET") {
      return toolRead(() => json(200, { ok: true, ...structuredClone(replications) }));
    }
    if (pathname === "/api/dev/replications/featured" && upper === "GET") {
      return toolRead(() => json(200, { slugs: replications.rows.slice(0, 12).map((row) => row.slug), curated: false }));
    }
    if (pathname === "/api/dev/replications/playlists" && upper === "GET") {
      return toolRead(() => json(200, { playlists: [] }));
    }

    if (pathname.startsWith("/api/")) {
      fixture.unhandled.push({ method: upper, pathname, search });
      // Answered here rather than passed on: the dev server would only say 401,
      // and a write must never leave the test browser.
      return json(upper === "GET" || upper === "HEAD" ? 404 : 501, { error: `No journey fixture answers ${upper} ${pathname}.` });
    }
    return null;
  }

  return fixture;
}
