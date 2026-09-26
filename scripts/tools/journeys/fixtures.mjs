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

/**
 * Invite codes for the admin's Home and People, newest first: two open (one
 * with languages), one expired, one used, one revoked, and two older codes the
 * history pages in on request (`INVITES_PAGE_SIZE`).
 */
function seedInvites() {
  const day = 86_400_000;
  const at = (offset) => new Date(FIXTURE_EPOCH + offset * day).toISOString();
  const invite = (id, role, created, expires, status, extra = {}) => ({
    id, role, createdBy: FIXTURE_EMAIL, createdAt: at(created), expiresAt: at(expires),
    maxUses: 1, redemptions: [], status, ...extra,
  });
  return [
    invite("fixture-invite-1", "editor", -2, 5, "active", { note: "For the fixture reviewer" }),
    invite("fixture-invite-2", "translator", -1, 13, "active", { glossaryLocales: ["de", "nl"] }),
    invite("fixture-invite-3", "contributor", -20, -13, "expired", { note: "Old batch" }),
    invite("fixture-invite-4", "contributor", -30, -23, "exhausted", {
      note: "River, for the colour set", redemptions: [{ email: FIXTURE_MEMBER, at: at(-29) }],
    }),
    invite("fixture-invite-5", "editor", -40, -33, "revoked", { note: "Sent to the wrong address", revokedAt: at(-39) }),
    invite("fixture-invite-6", "contributor", -90, -83, "exhausted", {
      maxUses: 3, redemptions: [{ email: "kayla@localhost.invalid", at: at(-89) }, { email: "banned@localhost.invalid", at: at(-88) }],
      note: "Workshop signups",
    }),
    invite("fixture-invite-7", "editor_translator", -120, -113, "expired", { glossaryLocales: ["ja"] }),
  ];
}

/** Invite history pages this many codes at a time, so "Load older codes" has a second page. */
const INVITES_PAGE_SIZE = 5;

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

/** Published reports an admin can assign in the fixture; any other slug answers 404. */
const OWNED_REPORT_SLUGS_EXTRA = Object.freeze(["museum-walk"]);

/** The viewer's own published trip reports, oldest last. */
export const OWNED_REPORT_SEED = Object.freeze([
  {
    id: "fixture-report-1",
    slug: "fixture-festival-notes",
    createdAt: FIXTURE_EPOCH - 300 * 3_600_000,
    fields: {
      title: "Fixture festival notes",
      subject: { name: "nervewing", trip_date: "2025-12-20" },
      substances: [{ name: "Psilocybin", dose: "2 g", roa: "oral" }],
      introduction: "A long day at a small festival, with friends close by the whole time.",
      onset: [
        { time: "T+0:30", description: "Colours on the stage lights begin to breathe." },
        { time: "T+0:50", description: "A warm body load and a lot of laughing." },
      ],
      peak: [{ time: "T+2:00", description: "The crowd sounds like one slow wave." }],
      offset: [],
      conclusion: "Slept well and felt clear the next morning.",
      tags: ["festival", "friends"],
    },
  },
  {
    id: "fixture-report-2",
    slug: "a-slow-walk-by-the-river",
    createdAt: FIXTURE_EPOCH - 40 * 3_600_000,
    fields: {
      title: "A slow walk by the river with a very long title that has to wrap on a phone",
      subject: { name: "nervewing", trip_date: "2026-01-10" },
      substances: [{ name: "LSD", dose: "75 µg", roa: "oral" }],
      onset: [],
      peak: [],
      offset: [],
      tags: [],
    },
  },
  {
    id: "fixture-report-3",
    slug: "quiet-evening",
    createdAt: FIXTURE_EPOCH - 900 * 3_600_000,
    fields: {
      title: "Quiet evening",
      subject: { name: "nervewing" },
      substances: [{ name: "Cannabis" }],
      introduction: "Short notes from a calm night in.",
      onset: [{ description: "Music felt closer." }],
      peak: [],
      offset: [],
      tags: ["music"],
    },
  },
]);
const OWNER_ASSIGNABLE_SLUGS = Object.freeze([...OWNED_REPORT_SEED.map((row) => row.slug), ...OWNED_REPORT_SLUGS_EXTRA]);

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

/**
 * The contributor directory the shell reads for every tool: public profiles
 * with no remote avatar, so People can pair them with accounts (see
 * `PROFILE_LINKS_SEED`) and nothing is fetched from a media host.
 */
export const CONTRIBUTOR_PROFILES_SEED = Object.freeze([
  ["NERVEWING", "Nervewing", "Site admin"],
  ["RIVER", "River Okafor", "Artist"],
  ["RIVER-SKETCHES", "River's sketchbook", null],
  ["MIRA", "Mira Hofstede", "Translator"],
  ["HALCYON", "Halcyon", "Researcher"],
  ["ZED", "Zed Artist", null],
  ["ARCHIVE-COLLECTIVE", "The Archive Collective", null],
].map(([key, displayName, role]) => Object.freeze({
  key, displayName, aliases: [], avatarUrl: null, bio: "", links: [], hasCustomBio: false, ...(role ? { role } : {}),
})));

/**
 * What the Contributors editor reads beside a directory profile
 * (`/api/dev/contributor-profile?key=`): stored fields past the directory's,
 * and the works and reports credited to the name. River carries a full record
 * (aliases, links, a curated order with one position whose work is gone, a
 * byline that is not their name); Mira an admin's note and the trust flags;
 * Halcyon the archival flag. No avatar points at a media host.
 */
export const CONTRIBUTOR_DETAIL_SEED = Object.freeze({
  RIVER: {
    aliases: ["riverdraws", "r. okafor"],
    bio: "Draws what the room does after the second hour. Most of these started as sketches on the back of a setlist.",
    links: [{ label: "Portfolio", url: "https://river.example.org" }, { label: "Mastodon", url: "https://social.example.org/@riverdraws" }],
    replicationOrder: ["fixture-replication-05", "fixture-replication-02", "fixture-replication-retired"],
    reportOrder: ["fixture-report-river-2"],
    works: Array.from({ length: 9 }, (_, index) => index + 1),
    reports: [
      ["fixture-report-river-1", "Night swimming, slowly", "River Okafor", "2025-09-12", true],
      ["fixture-report-river-2", "The kitchen that breathed", "riverdraws", "2025-06-03", false],
      ["fixture-report-river-3", "Two walks in the fog", "R. Okafor", null, false],
    ],
  },
  MIRA: {
    approved_replicator: true,
    staffNote: { markdown: "Mira translated the first glossary into Dutch and still reviews every change to it.", attribution: "Nervewing, editor" },
    works: [3, 7],
    reports: [],
  },
  HALCYON: { archival: true, exclude_from_gallery: true, works: [], reports: [] },
});

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

/**
 * Banners: the substance corpus the tool enables presets on
 * (`/api/dev/warning-banner/targets`). Class strings are free-form, as the real
 * articles' are, so a class search finds what an editor would find.
 */
export const BANNER_TARGETS_SEED = Object.freeze([
  ["alcohol", "Alcohol", ["Depressant"]],
  ["alprazolam", "Alprazolam", ["Benzodiazepine"]],
  ["caffeine", "Caffeine", ["Xanthine", "Stimulant"]],
  ["cocaine", "Cocaine", ["Alkaloid (tropane)", "Stimulant"]],
  ["diazepam", "Diazepam", ["Benzodiazepine"]],
  ["dxm", "DXM", ["Morphinan (substituted)", "Dissociative"]],
  ["fentanyl", "Fentanyl", ["Opioid", "Anilidopiperidine"]],
  ["ghb", "GHB", ["Depressant"]],
  ["heroin", "Heroin", ["Opioid", "Morphinan"]],
  ["ketamine", "Ketamine", ["Arylcyclohexylamine", "Dissociative"]],
  ["lsd", "LSD", ["Lysergamide", "Psychedelic"]],
  ["mdma", "MDMA", ["Amphetamine (substituted)", "Entactogen"]],
  ["morphine", "Morphine", ["Opioid", "Morphinan"]],
  ["oxycodone", "Oxycodone", ["Opioid", "Morphinan (semi-synthetic)"]],
  ["phenibut", "Phenibut", ["Gabapentinoid", "Depressant"]],
  ["psilocybin", "Psilocybin", ["Tryptamine", "Psychedelic"]],
  ["2c-b", "2C-B", ["Phenethylamine", "Psychedelic"]],
  ["25i-nbome", "25I-NBOMe", ["Phenethylamine", "Psychedelic"]],
].map(([slug, title, classes]) => Object.freeze({ slug, title, classes: Object.freeze(classes) })));

/**
 * Banner presets in every state the tool shows: live on a list (danger and
 * caution), live everywhere (the sitewide caution notice), enabled on nothing
 * (renders nowhere) and switched off. Diazepam carries three, so the
 * two-banner cap suppresses one there.
 */
export const BANNER_PRESETS_SEED = Object.freeze([
  {
    key: "opioid-respiratory", tone: "danger", icon: "lucide:wind", severityLabel: "Danger",
    headline: "Opioids and other depressants stop breathing together",
    points: ["Both slow the brainstem's drive to breathe, and together far more than either alone.", "The risk outlasts the high: redosing as it fades is when most overdoses happen."],
    enabled: true, allSubstances: false, enabledSlugs: ["diazepam", "fentanyl", "heroin", "morphine", "oxycodone"],
  },
  {
    key: "nbome-potency", tone: "danger", icon: "lucide:skull", severityLabel: "Danger",
    headline: "Active in micrograms, and often sold as LSD",
    points: ["A blotter that tastes bitter is not LSD.", "- Seizures and deaths are reported at doses that fit on one tab."],
    enabled: true, allSubstances: false, enabledSlugs: [],
  },
  {
    key: "serotonin-toxicity", tone: "unsafe", icon: "lucide:thermometer", severityLabel: "Unsafe",
    headline: "Overheating and serotonin toxicity",
    points: ["Stay cool, take breaks from dancing, and sip water rather than drinking a lot at once."],
    enabled: false, allSubstances: false, enabledSlugs: ["mdma"],
  },
  {
    key: "benzo-tolerance", tone: "caution", icon: "lucide:activity", severityLabel: "Caution",
    headline: "Tolerance builds within days, and stopping suddenly can cause seizures",
    points: ["Taper with medical help after daily use."],
    enabled: true, allSubstances: false, enabledSlugs: ["alprazolam", "diazepam"],
  },
  {
    key: "citation-system-overhaul-1", tone: "caution", icon: "lucide:triangle-alert", severityLabel: "Notice",
    headline: "Our citation system is being overhauled",
    points: ["Some references on this page may be missing or out of date while we rebuild them."],
    enabled: true, allSubstances: true, enabledSlugs: [],
  },
].map((preset) => Object.freeze(preset)));

/** Another member, who owns a playlist the editor can only read. */
export const FIXTURE_MEMBER = "river@localhost.invalid";

/** Another admin on the roster, whose account People shows without actions. */
export const FIXTURE_ADMIN_PEER = "lyrea@localhost.invalid";

/**
 * The roster (`/api/dev/members`, and People's `/api/dev/people`): the viewer,
 * another admin, members of every managed role (a translator and an editor
 * translator with languages), one who never signed in, and one banned account
 * the owner pickers leave out.
 */
export const MEMBERS_SEED = Object.freeze([
  { email: FIXTURE_EMAIL, username: "nervewing", name: "Nervewing", role: "admin", lastSeenAt: "2026-01-15T09:00:00.000Z" },
  { email: FIXTURE_ADMIN_PEER, username: "lyrea", role: "admin", lastSeenAt: "2026-01-12T18:30:00.000Z" },
  { email: FIXTURE_MEMBER, username: "river", name: "River Okafor", role: "contributor", invitedBy: FIXTURE_EMAIL, lastSeenAt: "2026-01-14T21:10:00.000Z" },
  { email: "kayla@localhost.invalid", username: "kayla", role: "editor", invitedBy: FIXTURE_EMAIL, lastSeenAt: "2026-01-10T08:00:00.000Z" },
  { email: "mira@localhost.invalid", username: "mira", name: "Mira Hofstede", role: "translator", glossaryLocales: ["de", "nl"], invitedBy: FIXTURE_ADMIN_PEER, lastSeenAt: "2025-12-02T12:00:00.000Z" },
  { email: "sol@localhost.invalid", username: "sol", role: "editor_translator", glossaryLocales: ["ja"], invitedBy: FIXTURE_EMAIL, lastSeenAt: "2026-01-15T07:45:00.000Z" },
  { email: "newcomer@localhost.invalid", username: "newcomer", role: "contributor", invitedBy: FIXTURE_EMAIL },
  { email: "banned@localhost.invalid", username: "banned-member", role: "contributor", bannedAt: "2025-11-01T00:00:00.000Z", invitedBy: FIXTURE_ADMIN_PEER, lastSeenAt: "2025-10-30T00:00:00.000Z" },
].map((member) => Object.freeze(member)));

/**
 * The account-to-profile links People reads (`links` on `/api/dev/people`):
 * paired accounts, a second profile on an account that already has one, and a
 * profile linked to an address nobody signs in with.
 */
export const PROFILE_LINKS_SEED = Object.freeze([
  { key: "NERVEWING", membershipEmail: FIXTURE_EMAIL },
  { key: "RIVER", membershipEmail: FIXTURE_MEMBER },
  { key: "RIVER-SKETCHES", membershipEmail: FIXTURE_MEMBER },
  { key: "MIRA", membershipEmail: "mira@localhost.invalid" },
  { key: "HALCYON", membershipEmail: "departed@localhost.invalid" },
].map((link) => Object.freeze(link)));

/**
 * Replication playlists in every state the Playlists tab shows: the viewer's
 * own (one long enough to fold, one holding a work that is no longer
 * published), another member's (read only below admin) and an unowned one
 * (admin only). Entries name `buildReplicationFixture` slugs.
 */
export const PLAYLISTS_SEED = Object.freeze([
  {
    key: "classic-psychedelic-opener", title: "Classic psychedelic opener", owner: FIXTURE_EMAIL, hoursAgo: 3,
    slugs: [1, 5, 2, 9, 13, 4].map((n) => `fixture-replication-${String(n).padStart(2, "0")}`),
  },
  {
    key: "late-night-geometry", title: "Late night geometry", owner: FIXTURE_EMAIL, hoursAgo: 50,
    slugs: ["fixture-replication-03", "fixture-replication-07", "retired-fixture-work", "fixture-replication-11"],
  },
  {
    key: "the-long-tunnel", title: "The long tunnel, every drifting and breathing work in one slow sequence", owner: FIXTURE_EMAIL, hoursAgo: 400,
    slugs: Array.from({ length: 23 }, (_, index) => `fixture-replication-${String(index + 1).padStart(2, "0")}`),
  },
  {
    key: "rivers-colour-set", title: "River's colour set", owner: FIXTURE_MEMBER, hoursAgo: 30,
    slugs: ["fixture-replication-02", "fixture-replication-06", "fixture-replication-10"],
  },
  {
    key: "house-opener", title: "House opener", owner: null, hoursAgo: 900,
    slugs: ["fixture-replication-01", "fixture-replication-12"],
  },
].map((playlist) => Object.freeze({ ...playlist, slugs: Object.freeze(playlist.slugs) })));

/** The site-wide banner glyph size the fixture stores. */
export const BANNER_ICON_SIZE_SEED = 40;

function titleCase(slug) {
  return slug.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

/**
 * The change log feed (`/api/editor/changelog`), in the shape the route
 * projects: newest first, one save every five hours back from the fixture
 * clock. The saves cycle through every kind the tab describes: an inline
 * prose edit, a source added and removed, a bare Dev editor stamp, a
 * hand-written note on a save that touched many articles, and one long diff.
 * Submitters are profile keys, never addresses.
 */
export function buildChangelogFixture(count = 24) {
  const hour = 3_600_000;
  const article = (id, title) => ({ id, title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
  const many = ["Caffeine", "Nicotine", "Alcohol", "Cannabis", "Kratom", "Modafinil", "Phenibut", "Tramadol", "Codeine", "Gabapentin", "Pregabalin", "Zolpidem", "Diazepam", "Alprazolam"]
    .map((title, index) => article(500 + index, title));
  const longDiff = Array.from({ length: 60 }, (_, line) => [
    `-      "Dose ${line + 1} was listed in the old table",`,
    `+      "Dose ${line + 1} now matches the reviewed table",`,
  ]).flat().join("\n");
  const kinds = [
    (n) => ({
      message: "Inline edit \u2014 summary",
      articles: [article(301, "Mescaline")],
      markdown: `-Mescaline is a naturally occurring psychedelic of the phenethylamine class.\n+Mescaline is a naturally occurring psychedelic of the phenethylamine class, known for its long duration.${n % 2 ? "\n+It is found in several cacti." : ""}`,
    }),
    () => ({
      message: "Added a source \u2014 Nichols 2016, Psychedelics",
      articles: [article(302, "Psilocybin")],
      markdown: "+  { \"title\": \"Nichols 2016, Psychedelics\", \"doi\": \"10.1124/pr.115.011478\" }",
    }),
    () => ({
      message: "Dev editor update - 1/12/2026, 3:04:11 PM",
      articles: [article(303, "LSD")],
      markdown: "# LSD \u00b7 #303\n\n-      \"onset\": \"20-60 minutes\",\n+      \"onset\": \"30-90 minutes\",\n-      \"peak\": \"3-5 hours\"\n+      \"peak\": \"2-4 hours\"",
    }),
    () => ({
      message: "Dev editor update - Tightened the interaction warnings across depressants",
      articles: many,
      markdown: many.map((entry) => `# ${entry.title} \u00b7 #${entry.id}\n\n-      \"status\": \"caution\"\n+      \"status\": \"dangerous\"`).join("\n\n"),
    }),
    () => ({
      message: "Removed a source \u2014 An unreviewed forum post",
      articles: [article(304, "MDMA")],
      markdown: "-  { \"title\": \"An unreviewed forum post\" }",
    }),
    () => ({
      message: "Inline edit \u2014 routes[oral].dosage.heavy",
      articles: [article(305, "Ketamine")],
      markdown: "-150 mg\n+150 mg or more [cite:doi-10.1000-fixture]",
    }),
    () => ({
      message: "Dev editor update - Rewrote the dose tables from the reviewed sources",
      articles: [article(306, "2C-B"), article(307, "2C-E")],
      markdown: `# 2C-B \u00b7 #306\n\n${longDiff}`,
    }),
  ];
  const submitters = ["JOSIE", "KAYLA", null, "RIVER"];
  return Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(4, "0");
    return {
      entryId: `fixture-change-${n}`,
      createdAt: new Date(FIXTURE_EPOCH - (index * 5 + 1) * hour).toISOString(),
      submittedBy: submitters[index % submitters.length],
      ...kinds[index % kinds.length](index),
    };
  });
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
export function createJourneyFixture({ role = "admin", state = "loaded", replicationRows = 24, changelogRows = 24 } = {}) {
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
  const changelog = buildChangelogFixture(state === "empty" ? 0 : changelogRows);
  const inbox = state === "empty"
    ? { trip: [], article: [], site: [], glossary: [], citations: [], claims: [] }
    : seedInbox();
  /** Records someone else already saved over, so a `conflicted` store bumps each once. */
  const contested = new Set();
  /** The viewer's own published trip reports (My reports), keyed by id. */
  const ownedReports = new Map(
    (state === "empty" ? [] : OWNED_REPORT_SEED).map((row) => [row.id, { ...structuredClone(row), ownerEmail: FIXTURE_EMAIL, revision: nextRevision() }]),
  );
  /** Banner presets keyed by key, each with its revision, plus the answered writes by change id. */
  const banners = {
    presets: new Map((state === "empty" ? [] : BANNER_PRESETS_SEED).map((preset) => [preset.key, { preset: structuredClone(preset), baseHash: nextRevision() }])),
    operations: new Map(),
    iconSize: BANNER_ICON_SIZE_SEED,
  };

  /** Replication playlists keyed by key (Playlists). */
  const playlists = new Map(
    (state === "empty" ? [] : PLAYLISTS_SEED).map((row) => [row.key, {
      key: row.key,
      title: row.title,
      replication_slugs: [...row.slugs],
      updated_at: new Date(FIXTURE_EPOCH - row.hoursAgo * 3_600_000).toISOString(),
      updated_by: row.owner ?? FIXTURE_OTHER_ADMIN,
      owner_email: row.owner,
    }]),
  );

  /** People: accounts by email, the profile links, invite codes and stored profiles, all changed by writes. */
  const people = {
    members: new Map((state === "empty" ? MEMBERS_SEED.filter((member) => member.email === FIXTURE_EMAIL) : MEMBERS_SEED)
      .map((member) => [member.email, structuredClone(member)])),
    links: state === "empty" ? [] : PROFILE_LINKS_SEED.map((link) => ({ ...link })),
    invites: state === "empty" ? [] : seedInvites(),
    inviteCounter: 0,
    profiles: new Map(),
    /** Profiles a merge or delete removed from the directory. */
    removedProfiles: new Set(),
  };

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

  function saveOwnedReport(body) {
    const row = ownedReports.get(String(body.id ?? ""));
    if (!row) return json(404, { error: "That trip report no longer exists." });
    // Someone else's save lands just before the owner's first one.
    if (fixture.state === "conflicted" && !contested.has(row.id)) {
      contested.add(row.id);
      row.fields = { ...row.fields, introduction: `${row.fields.introduction ?? ""} Edited by someone else.`.trim() };
      row.revision = nextRevision();
    }
    if (body.expectedRevision !== row.revision) {
      return json(409, { error: `Trip report ${row.slug} changed since it was opened. Reload it and apply your edits again.` });
    }
    const updates = body.updates ?? {};
    // An owner saves content only: title, tags and the body. Byline, subject and substances stay.
    row.fields = {
      ...row.fields,
      title: String(updates.title ?? row.fields.title),
      tags: Array.isArray(updates.tags) ? updates.tags : row.fields.tags,
      introduction: updates.introduction,
      onset: Array.isArray(updates.onset) ? updates.onset : row.fields.onset,
      peak: Array.isArray(updates.peak) ? updates.peak : row.fields.peak,
      offset: Array.isArray(updates.offset) ? updates.offset : row.fields.offset,
      conclusion: updates.conclusion,
    };
    row.revision = nextRevision();
    return json(200, { ok: true, slug: row.slug, fields: structuredClone(row.fields), revision: row.revision });
  }

  function bannerDoc({ preset, baseHash }) {
    return { ...structuredClone(preset), baseHash };
  }

  /**
   * The warning route's publish and delete: the revision check (409 with the
   * route's words), a conflicted store's concurrent save, slugs that name no
   * article dropped from the echo, and each answer kept by change id so a
   * retried write reconciles instead of publishing twice.
   */
  function writeBanner(method, body) {
    const key = String(body.key ?? "");
    const row = banners.presets.get(key);
    if (fixture.state === "conflicted" && row && !contested.has(`banner:${key}`)) {
      contested.add(`banner:${key}`);
      row.preset = { ...row.preset, headline: `${row.preset.headline} (edited by someone else)` };
      row.baseHash = nextRevision();
    }
    if (body.baseHash !== (row?.baseHash ?? fixtureRevision(0))) {
      return json(409, { error: "This warning changed since it was opened. Reload its current version before publishing; your local edits have not been applied." });
    }
    const changeId = String(body.changeId ?? "");
    const base = { key, changeId, affectedSlugs: [], publication: { status: "published" } };
    let answer;
    if (method === "DELETE") {
      banners.presets.delete(key);
      answer = { ...base, baseHash: fixtureRevision(0), preset: null, allSubstances: false, enabledSlugs: [] };
    } else {
      const known = new Set(BANNER_TARGETS_SEED.map((target) => target.slug));
      const enabledSlugs = [...new Set((body.enabledSlugs ?? []).filter((slug) => known.has(slug)))].sort();
      const preset = {
        key, tone: body.tone, icon: body.icon, severityLabel: body.severityLabel, headline: body.headline,
        points: body.points ?? [], enabled: Boolean(body.enabled), allSubstances: Boolean(body.allSubstances), enabledSlugs,
      };
      const baseHash = nextRevision();
      banners.presets.set(key, { preset, baseHash });
      answer = { ...base, baseHash, preset: structuredClone(preset), allSubstances: preset.allSubstances, enabledSlugs };
    }
    banners.operations.set(changeId, answer);
    return json(200, { ok: true, ...structuredClone(answer) });
  }

  /** Whether the session may change a playlist: its owner, or any admin. */
  function playlistEditable(row) {
    return fixture.role === "admin" || row.owner_email === fixture.session.user.email;
  }

  /** The collection route: editors and admins list every playlist, everyone else only their own. */
  function listPlaylists() {
    const all = fixture.role === "admin" || fixture.role === "editor" || fixture.role === "editor_translator";
    return [...playlists.values()]
      .filter((row) => all || row.owner_email === fixture.session.user.email)
      .sort((left, right) => left.title.localeCompare(right.title))
      .map(({ replication_slugs, ...row }) => ({ ...row, work_count: replication_slugs.length, editable: playlistEditable(row) }));
  }

  /**
   * The upsert: the `updated_at` check (409 with the stored row), the owner
   * rule (403 NOT_OWNER), and entries that name no published work pruned and
   * named in the answer. A conflicted store saves each playlist once as
   * someone else just before the editor's first save.
   */
  function savePlaylistRow(body) {
    const key = String(body.key ?? "");
    const existing = playlists.get(key);
    if (fixture.state === "conflicted" && existing && !contested.has(`playlist:${key}`)) {
      contested.add(`playlist:${key}`);
      existing.title = `${existing.title} (edited by someone else)`;
      existing.updated_at = tick();
      existing.updated_by = FIXTURE_OTHER_ADMIN;
    }
    if (existing && !playlistEditable(existing)) {
      return json(403, { error: `"${existing.title}" belongs to ${existing.owner_email}; only its owner or an admin may change it.`, code: "NOT_OWNER" });
    }
    if ((existing?.updated_at ?? null) !== (body.expectedUpdatedAt ?? null)) {
      return json(409, { ok: false, conflict: existing ? structuredClone(existing) : null });
    }
    const known = new Set(replications.rows.map((row) => row.slug));
    const slugs = [...new Set(Array.isArray(body.slugs) ? body.slugs : [])];
    const row = {
      key,
      title: String(body.title ?? "").trim(),
      replication_slugs: slugs.filter((slug) => known.has(slug)),
      updated_at: tick(),
      updated_by: fixture.session.user.email,
      owner_email: existing ? existing.owner_email : (fixture.role === "admin" ? (body.ownerEmail ?? null) : fixture.session.user.email),
    };
    playlists.set(key, row);
    return json(200, { ok: true, playlist: { ...structuredClone(row), editable: true, pruned: slugs.filter((slug) => !known.has(slug)) } });
  }

  /** The bounded candidates read: newest first, at most 24 matches, or the asked slugs that exist. */
  function playlistCandidates(params) {
    const project = (row) => ({ slug: row.slug, title: row.title, artist: row.artist, type: row.type, thumbnail_url: row.thumbnail_url, url: row.type === "image" ? row.url : null, duration: row.duration });
    const asked = params.get("slugs");
    if (asked !== null) {
      const bySlug = new Map(replications.rows.map((row) => [row.slug, row]));
      return json(200, { ok: true, candidates: asked.split(",").flatMap((slug) => (bySlug.has(slug) ? [project(bySlug.get(slug))] : [])) });
    }
    const words = (params.get("q") ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found = replications.rows
      .filter((row) => words.every((word) => `${row.title} ${row.artist} ${row.slug}`.toLowerCase().includes(word)))
      .slice(0, 24)
      .map(project);
    return json(200, { ok: true, candidates: found });
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

  /** One page of invite history, newest first; the cursor is the index the next page starts at. */
  function invitePage(cursor) {
    const start = cursor ? Number(cursor.replace("fixture-invites-", "")) || 0 : 0;
    const invites = people.invites.slice(start, start + INVITES_PAGE_SIZE);
    const next = start + INVITES_PAGE_SIZE;
    return json(200, { ok: true, invites: structuredClone(invites), continuationCursor: next < people.invites.length ? `fixture-invites-${next}` : null });
  }

  function mintInvite(input) {
    const roles = ["editor", "translator", "editor_translator", "contributor"];
    if (!roles.includes(input.role)) return json(400, { error: "Choose Editor, Translator, both, or Contributor." });
    const translates = input.role === "translator" || input.role === "editor_translator";
    const glossaryLocales = Array.isArray(input.glossaryLocales) ? input.glossaryLocales : [];
    if (translates && glossaryLocales.length === 0) return json(400, { error: "Choose at least one glossary language for a translator." });
    const days = Number(input.expiresInDays ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 365) return json(400, { error: "Expiry must be between 1 and 365 days." });
    const maxUses = Number(input.maxUses ?? 1);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) return json(400, { error: "Uses must be between 1 and 100." });
    const createdAt = tick();
    const invite = {
      id: `fixture-invite-minted-${++people.inviteCounter}`,
      role: input.role,
      ...(translates ? { glossaryLocales } : {}),
      createdBy: fixture.session.user.email,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + days * 86_400_000).toISOString(),
      maxUses,
      redemptions: [],
      status: "active",
      ...(typeof input.note === "string" && input.note.trim() ? { note: input.note.trim() } : {}),
    };
    people.invites.unshift(invite);
    return json(200, { ok: true, code: `fixt-ure${people.inviteCounter}-code-abcd-efgh-jkmn`, invite: structuredClone(invite) });
  }

  function revokeInvite(id) {
    const invite = people.invites.find((row) => row.id === id);
    if (!invite) return json(404, { error: "No invite code has that id." });
    if (invite.status !== "active") return json(400, { error: `That invite is already ${invite.status === "exhausted" ? "fully redeemed" : invite.status}.` });
    Object.assign(invite, { status: "revoked", revokedAt: tick() });
    return json(200, { ok: true });
  }

  /** The member writes, refused the way Postgres refuses them: admins and the actor's own row. */
  function memberWrite(action, input) {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const member = people.members.get(email);
    if (!member) return json(404, { error: `No member has the address ${email}.` });
    if (member.role === "admin") return json(403, { error: "Admin accounts are managed from the seed script." });
    if (email === fixture.session.user.email) return json(403, { error: "You cannot change your own account." });
    if (action === "reset") return json(200, { ok: true, resetPath: `/reset-password?token=fixture-reset-${member.username ?? "member"}` });
    if (action === "ban") member.bannedAt = tick();
    if (action === "unban") delete member.bannedAt;
    if (action === "role") {
      member.role = input.role;
      if (input.role === "translator" || input.role === "editor_translator") member.glossaryLocales = [...(input.glossaryLocales ?? [])];
      else delete member.glossaryLocales;
    }
    return json(200, { ok: true, email });
  }

  /** A directory profile as the editor reads it, with its link and any saved changes. */
  function directoryProfile(key) {
    const entry = CONTRIBUTOR_PROFILES_SEED.find((profile) => profile.key === key);
    if (!entry || people.removedProfiles.has(key)) return null;
    if (!people.profiles.has(key)) {
      const { works: _works, reports: _reports, ...stored } = fixture.state === "empty" ? {} : (CONTRIBUTOR_DETAIL_SEED[key] ?? {});
      people.profiles.set(key, {
        key, displayName: entry.displayName, aliases: [], bio: fixture.state === "empty" ? "" : `${entry.displayName} keeps notes for the fixture.`,
        role: entry.role ?? null, links: [], membershipEmail: null, avatarUrl: null, avatarStorageId: null, storedAvatarUrl: null,
        replicationOrder: [], orderingRevision: nextRevision(), reportOrder: [], exclude_from_gallery: false, archival: false,
        approved_replicator: false, staffNote: null, updatedAt: new Date(FIXTURE_EPOCH - 86_400_000).toISOString(), updatedBy: FIXTURE_ADMIN_PEER,
        ...structuredClone(stored),
      });
    }
    const profile = people.profiles.get(key);
    profile.membershipEmail = people.links.find((link) => link.key === key)?.membershipEmail ?? null;
    return profile;
  }

  /** The works and reports credited to a profile, in the route's default order (newest first). */
  function creditedTo(key) {
    const seed = fixture.state === "empty" ? null : CONTRIBUTOR_DETAIL_SEED[key];
    const profile = people.profiles.get(key);
    const works = (seed?.works ?? []).map((n) => {
      const id = String(n).padStart(2, "0");
      return {
        slug: `fixture-replication-${id}`, title: `Fixture replication ${id}`, artist: profile?.displayName ?? key, role: "replication",
        type: n % 4 === 0 ? "video" : "image", effectSlug: ["drifting", "geometry", "tracers"][n % 3],
        createdAt: new Date(FIXTURE_EPOCH - n * 86_400_000 * 9).toISOString(), thumbnailUrl: null,
      };
    });
    const reports = (seed?.reports ?? []).map(([slug, title, authorName, tripDate, featured]) => ({ slug, title, authorName, tripDate, featured }));
    return { works, reports };
  }

  /** The ordering route: editor floor, own record unless admin, the works revision checked like Postgres checks it. */
  function saveContributorOrdering(input) {
    if (!["admin", "editor", "editor_translator"].includes(fixture.role)) return json(403, { error: "Editor access required." });
    const profile = directoryProfile(String(input.key ?? ""));
    if (!profile) return json(400, { error: `Profile "${input.key}" not found.` });
    if (fixture.role !== "admin" && profile.membershipEmail !== FIXTURE_EMAIL) return json(403, { error: "You can only edit your own contributor profile." });
    if (fixture.state === "conflicted" && !contested.has(`ordering:${profile.key}`)) {
      contested.add(`ordering:${profile.key}`);
      profile.orderingRevision = nextRevision();
    }
    if (Array.isArray(input.replicationOrder) && input.expectedRevision !== profile.orderingRevision) {
      return json(409, { error: "This collection changed. Reload its stored order before saving.", code: "CONFLICT" });
    }
    const { works, reports } = creditedTo(profile.key);
    const prune = (order, items) => ({ kept: order.filter((slug) => items.some((item) => item.slug === slug)), pruned: order.filter((slug) => !items.some((item) => item.slug === slug)) });
    const answer = { ok: true, key: profile.key, prunedReplicationSlugs: [], prunedReportSlugs: [] };
    if (Array.isArray(input.replicationOrder)) {
      const { kept, pruned } = prune(input.replicationOrder, works);
      Object.assign(profile, { replicationOrder: kept, orderingRevision: nextRevision() });
      answer.prunedReplicationSlugs = pruned;
    }
    if (Array.isArray(input.reportOrder)) {
      const { kept, pruned } = prune(input.reportOrder, reports);
      profile.reportOrder = kept;
      answer.prunedReportSlugs = pruned;
    }
    return json(200, { ...answer, replicationOrder: profile.replicationOrder, reportOrder: profile.reportOrder });
  }

  /** Merge, delete and retarget: admin floor and the typed key, as the danger route checks them. */
  function contributorDanger(input) {
    if (fixture.role !== "admin") return json(403, { error: "Admin access required." });
    const confirmed = (expected) => String(input.confirmKey ?? "").trim().toLowerCase() === String(expected ?? "").trim().toLowerCase();
    if (input.action === "merge") {
      if (!confirmed(input.fromKey)) return json(400, { error: `Type "${input.fromKey}" to confirm this merge.` });
      const from = directoryProfile(String(input.fromKey));
      const to = directoryProfile(String(input.toKey));
      if (!from || !to) return json(400, { error: "Both profiles must exist to merge." });
      to.aliases = [...new Set([...to.aliases, from.displayName.toLowerCase(), from.key.toLowerCase(), ...from.aliases])];
      people.removedProfiles.add(from.key);
      return json(200, { ok: true, action: "merge", mergedFrom: from.key, mergedInto: to.key, reportsUpdated: creditedTo(from.key).reports.length, aliases: to.aliases });
    }
    if (input.action === "delete") {
      if (!confirmed(input.key)) return json(400, { error: `Type "${input.key}" to confirm this deletion.` });
      const profile = directoryProfile(String(input.key));
      if (!profile) return json(400, { error: `Profile "${input.key}" not found.` });
      const credited = creditedTo(profile.key).reports.length;
      if (credited > 0) return json(400, { error: `${credited} trip report(s) still credit ${profile.key}. Retarget or merge them before deleting.` });
      people.removedProfiles.add(profile.key);
      return json(200, { ok: true, action: "delete", key: profile.key, displayName: profile.displayName });
    }
    if (input.action === "retarget") {
      if (!confirmed(input.contributorKey)) return json(400, { error: `Type "${input.contributorKey}" to confirm this retarget.` });
      const profile = directoryProfile(String(input.contributorKey));
      if (!profile) return json(400, { error: `Profile "${input.contributorKey}" not found.` });
      const author = String(input.authorName ?? "").trim().toLowerCase();
      if (!profile.aliases.includes(author)) profile.aliases = [...profile.aliases, author];
      return json(200, { ok: true, action: "retarget", reportsUpdated: author ? 1 : 0 });
    }
    return json(400, { error: "Unknown contributor action." });
  }

  /** The profile route's admin patch: fields and the membership email, checked against `expectedUpdatedAt`. */
  function saveContributorProfile(input) {
    const profile = directoryProfile(String(input.key ?? ""));
    if (!profile) return json(200, { ok: true });
    if (fixture.role !== "admin" && profile.membershipEmail && profile.membershipEmail !== FIXTURE_EMAIL) {
      return json(403, { error: "You can only edit your own contributor profile." });
    }
    if (fixture.state === "conflicted" && !contested.has(`profile:${profile.key}`)) {
      contested.add(`profile:${profile.key}`);
      profile.updatedAt = tick();
    }
    if ((input.expectedUpdatedAt ?? null) !== profile.updatedAt) {
      return json(409, { error: "Someone saved this profile after you loaded it. Reload it and try again.", code: "REVISION_CONFLICT" });
    }
    if ("membershipEmail" in input) {
      people.links = people.links.filter((link) => link.key !== profile.key);
      if (typeof input.membershipEmail === "string") people.links.push({ key: profile.key, membershipEmail: input.membershipEmail.trim().toLowerCase() });
    }
    for (const field of ["displayName", "bio", "role", "aliases", "links", "exclude_from_gallery", "archival", "approved_replicator", "staffNote", "avatarUrl"]) {
      if (field in input && input[field] !== undefined) profile[field] = structuredClone(input[field]);
    }
    // An uploaded file is kept as the data it arrived as, so the preview survives the reload without a media host.
    if (input.avatarUpload?.base64) {
      Object.assign(profile, { avatarUrl: null, avatarStorageId: "fixture-avatar", storedAvatarUrl: `data:${input.avatarUpload.mimeType};base64,${input.avatarUpload.base64}` });
    } else if (input.avatarUrl === null) {
      Object.assign(profile, { avatarStorageId: null, storedAvatarUrl: null });
    }
    Object.assign(profile, { updatedAt: tick(), updatedBy: fixture.session.user.email });
    return json(200, { ok: true });
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
      if (pathname === "/api/editor/contributor-profiles") return json(200, structuredClone(CONTRIBUTOR_PROFILES_SEED.filter((profile) => !people.removedProfiles.has(profile.key))));
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
      return toolRead(() => invitePage(params.get("cursor")));
    }
    if (pathname === "/api/dev/invites" && upper === "POST") return toolWrite(() => mintInvite(body ?? {}));
    const revokeMatch = /^\/api\/dev\/invites\/([^/]+)\/revoke$/.exec(pathname);
    if (revokeMatch && upper === "POST") return toolWrite(() => revokeInvite(decodeURIComponent(revokeMatch[1])));
    if (pathname === "/api/dev/translation-inbox" && upper === "GET") {
      const locale = params.get("locale") ?? "";
      const total = fixture.state === "empty" ? 0 : (TRANSLATION_INBOX_TOTALS[locale] ?? 0);
      return toolRead(() => json(200, { ok: true, locale, items: [], total, counts: {} }));
    }
    if (pathname === "/api/dev/contributor-profile" && upper === "POST") return toolWrite(() => saveContributorProfile(body ?? {}));
    if (pathname === "/api/dev/contributor-profile/ordering" && upper === "POST") return toolWrite(() => saveContributorOrdering(body ?? {}));
    if (pathname === "/api/dev/contributor-profile/danger" && upper === "POST") return toolWrite(() => contributorDanger(body ?? {}));
    if (pathname === "/api/dev/contributor-profile" && upper === "GET") {
      const key = params.get("key") ?? "";
      const known = directoryProfile(key);
      if (known) return toolRead(() => json(200, { ok: true, profile: structuredClone(known), ...creditedTo(known.key) }));
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
          { id: "fixture-submission-3", title: "Museum walk", status: "rejected", submitted_at: at(700), decided_at: at(650), public_reason: "The dose for the second substance is missing, so readers could not compare it." },
          { id: "fixture-submission-4", title: "Night drive home", status: "accepted", submitted_at: at(120), decided_at: at(60) },
          { id: "fixture-submission-5", title: "First time, in a tent", status: "new", submitted_at: at(2) },
          { id: "fixture-submission-6", title: "Untitled notes", status: "rejected", submitted_at: at(1200), decided_at: at(1100) },
        ],
      }));
    }
    if (pathname === "/api/dev/trip-reports/mine" && upper === "GET") {
      return toolRead(() => json(200, {
        ok: true,
        reports: [...ownedReports.values()].map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.fields.title,
          ...(row.fields.subject.trip_date ? { tripDate: row.fields.subject.trip_date } : {}),
          createdAt: row.createdAt,
        })),
      }));
    }
    // My reports: one owned report's editable body, its save, and the admin's owner assignment.
    if (pathname === "/api/dev/trip-reports/record") {
      if (upper === "GET") {
        const row = ownedReports.get(params.get("id") ?? "");
        return toolRead(() => row
          ? json(200, { ok: true, report: { id: row.id, slug: row.slug, ownerEmail: row.ownerEmail, fields: structuredClone(row.fields), revision: row.revision } })
          : json(404, { error: "That trip report no longer exists." }));
      }
      if (upper === "POST") return toolWrite(() => saveOwnedReport(body ?? {}));
    }
    const ownerMatch = /^\/api\/dev\/trip-reports\/([^/]+)\/owner$/.exec(pathname);
    if (ownerMatch && upper === "POST") {
      return toolWrite(() => {
        const slug = decodeURIComponent(ownerMatch[1]).trim();
        const email = String(body?.email ?? "").trim().toLowerCase();
        if (!email) return json(400, { error: "A member email is required." });
        if (!OWNER_ASSIGNABLE_SLUGS.includes(slug)) return json(404, { error: `No published trip report has the address /reports/${slug}.` });
        return json(200, { ok: true, slug, ownerEmail: email });
      });
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

    // Change log: the route caps `limit` at 500, as `changelog.getRecent` does.
    if (pathname === "/api/editor/changelog" && upper === "GET") {
      const limit = Math.min(Number(params.get("limit") ?? 50) || 50, 500);
      return toolRead(() => json(200, structuredClone(changelog.slice(0, limit))));
    }

    // Banners: presets, the corpus, the site-wide glyph size, and the preview's article read.
    if (pathname === "/api/dev/warning-banner") {
      if (upper === "GET") {
        const key = params.get("key");
        if (!key) return toolRead(() => json(200, { presets: [...banners.presets.values()].map(bannerDoc) }));
        const row = banners.presets.get(key);
        const operation = banners.operations.get(params.get("changeId") ?? "") ?? null;
        return toolRead(() => json(200, { preset: row ? structuredClone(row.preset) : null, baseHash: row?.baseHash ?? fixtureRevision(0), history: [], operation }));
      }
      if (upper === "POST" || upper === "DELETE") return toolWrite(() => writeBanner(upper, body ?? {}));
    }
    if (pathname === "/api/dev/warning-banner/targets" && upper === "GET") {
      return toolRead(() => json(200, { ok: true, items: structuredClone(BANNER_TARGETS_SEED) }));
    }
    if (pathname === "/api/editor/banner-display" && upper === "GET") {
      return toolRead(() => json(200, { iconSize: banners.iconSize }));
    }
    if (pathname === "/api/dev/warning-banner/display" && upper === "POST") {
      return toolWrite(() => {
        const size = Math.min(72, Math.max(24, Math.round(Number(body?.iconSize) || BANNER_ICON_SIZE_SEED)));
        banners.iconSize = size;
        return json(200, { ok: true, iconSize: size });
      });
    }
    if (pathname === "/api/editor/molecule-overrides" && upper === "GET") return json(200, null);

    if (pathname === "/api/dev/replications" && upper === "GET") {
      return toolRead(() => json(200, { ok: true, ...structuredClone(replications) }));
    }
    if (pathname === "/api/dev/replications/featured" && upper === "GET") {
      return toolRead(() => json(200, { slugs: replications.rows.slice(0, 12).map((row) => row.slug), curated: false }));
    }
    // Playlists: the member's own playlists, one by key, the upsert, removal, owner handoff and the work lookup.
    if (pathname === "/api/dev/replications/playlists") {
      if (upper === "GET") return toolRead(() => json(200, { ok: true, playlists: listPlaylists() }));
      if (upper === "POST") return toolWrite(() => savePlaylistRow(body ?? {}));
    }
    const playlistMatch = /^\/api\/dev\/replications\/playlists\/([^/]+)(\/owner)?$/.exec(pathname);
    if (playlistMatch) {
      const row = playlists.get(decodeURIComponent(playlistMatch[1]));
      const missing = () => json(404, { ok: false, error: "No playlist with that key." });
      if (playlistMatch[2] && upper === "POST") {
        return toolWrite(() => {
          if (fixture.role !== "admin") return json(403, { error: "Only an admin can hand a playlist to a member." });
          if (!row) return missing();
          const ownerEmail = body?.ownerEmail ? String(body.ownerEmail).trim().toLowerCase() : null;
          if (ownerEmail && !MEMBERS_SEED.some((member) => member.email === ownerEmail)) return json(404, { error: `No member has the address ${ownerEmail}.`, code: "MEMBER_NOT_FOUND" });
          Object.assign(row, { owner_email: ownerEmail, updated_at: tick(), updated_by: fixture.session.user.email });
          return json(200, { ok: true, key: row.key, owner_email: row.owner_email, updated_at: row.updated_at, updated_by: row.updated_by });
        });
      }
      if (!playlistMatch[2] && upper === "GET") {
        return toolRead(() => (row && (playlistEditable(row) || listPlaylists().some((entry) => entry.key === row.key))
          ? json(200, { ok: true, playlist: { ...structuredClone(row), editable: playlistEditable(row) } })
          : missing()));
      }
      if (!playlistMatch[2] && upper === "DELETE") {
        return toolWrite(() => {
          if (!row) return missing();
          if (!playlistEditable(row)) return json(403, { error: `"${row.title}" belongs to ${row.owner_email}; only its owner or an admin may change it.`, code: "NOT_OWNER" });
          playlists.delete(row.key);
          return json(200, { ok: true, key: row.key });
        });
      }
    }
    if (pathname === "/api/dev/replications/playlist-candidates" && upper === "GET") {
      return toolRead(() => playlistCandidates(params));
    }
    if (pathname === "/api/dev/members" && upper === "GET") {
      return toolRead(() => json(200, { ok: true, self: fixture.session.user.email, members: structuredClone([...people.members.values()]) }));
    }
    if (pathname === "/api/dev/people" && upper === "GET") {
      return toolRead(() => json(200, {
        ok: true,
        self: fixture.session.user.email,
        members: structuredClone([...people.members.values()]),
        links: structuredClone(people.links),
      }));
    }
    const memberAction = /^\/api\/dev\/members\/(role|ban|unban|reset)$/.exec(pathname);
    if (memberAction && upper === "POST") return toolWrite(() => memberWrite(memberAction[1], body ?? {}));

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
