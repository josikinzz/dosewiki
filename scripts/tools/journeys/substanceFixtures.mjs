import EMPTY_ARTICLE from "./emptyArticleSeed.json" with { type: "json" };
import SUBSTANCE_ARTICLES from "./substanceArticlesSeed.json" with { type: "json" };

export const WHOLE_ARTICLE_SLUGS = Object.freeze(Object.keys(SUBSTANCE_ARTICLES));

export const UNDRAWABLE_ARTICLE_SLUGS = Object.freeze(["caffeine"]);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function mergeOver(base, overlay) {
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = isPlainObject(value) && isPlainObject(merged[key]) ? mergeOver(merged[key], value) : structuredClone(value);
  }
  return merged;
}

export const CONCURRENT_SUMMARY_SUFFIX = " Edited by another admin while you were working.";

export function wholeArticle(row) {
  if (!row?.slug || UNDRAWABLE_ARTICLE_SLUGS.includes(row.slug)) return null;
  const seed = SUBSTANCE_ARTICLES[row.slug];
  if (!seed) {
    return mergeOver(EMPTY_ARTICLE, { ...row, editorial_review: row.editorial_review ?? { status: "needed", notes: "" } });
  }
  return {
    ...structuredClone(seed),
    ...structuredClone(row),
    editorial_review: structuredClone(row.editorial_review ?? { status: row.slug === "lsd" ? "in_progress" : "needed" }),
  };
}

const HOUR = 3_600_000;

export function createSubstanceRoutes({ fixture, json, toolRead, toolWrite, epoch, otherAdmin, row, proposals, proposalSummary }) {
  const store = new Map();
  let hashCounter = 0;
  let revisionCounter = 0;
  let proposalCounter = 0;
  const nextHash = (slug) => `article-${slug}-${(++hashCounter).toString(16).padStart(4, "0")}`;
  const at = (hoursAgo) => new Date(epoch - hoursAgo * HOUR).toISOString();

  function recordFor(slug) {
    if (store.has(slug)) return store.get(slug);
    const base = row(slug);
    if (!base) return null;
    const article = wholeArticle(base) ?? structuredClone(base);
    const record = { article, baseHash: nextHash(slug), draft: null, draftVersion: 0, history: [], reads: 0, receipts: new Map() };
    if (fixture.state !== "empty" && slug === "mdma" && article.dosage?.routes?.[0]) {
      const draft = structuredClone(article);
      const tier = draft.dosage.routes[0].dose_ranges.moderate;
      draft.dosage.routes[0].dose_ranges.moderate = { ...tier, min: 90, max: 140 };
      record.draft = { article: draft, baseHash: record.baseHash, version: 3, updatedAt: at(5) };
      record.draftVersion = 3;
    }
    if (fixture.state !== "empty" && slug === "lsd") {
      const before = structuredClone(article);
      before.tolerance = { ...(before.tolerance ?? {}), full_tolerance: "Almost immediately after ingestion" };
      const older = structuredClone(before);
      older.summary = `${before.summary ?? ""}`.replace(/\.\s*$/, "") + ".";
      record.history = [
        revision(slug, before, article, "Tolerance: full tolerance wording", otherAdmin, 30),
        revision(slug, older, before, "Summary: tidy the last sentence", fixture.session.user.email, 200),
      ];
      record.history[0].resultHash = record.baseHash;
    }
    store.set(slug, record);
    return record;
  }

  function revision(slug, before, after, summary, actorEmail, hoursAgo) {
    const baseHash = nextHash(slug);
    return { revisionId: `revision-${slug}-${++revisionCounter}`, actorEmail, createdAt: at(hoursAgo), before, after, summary, baseHash, resultHash: nextHash(slug) };
  }

  function articleProposals(slug) {
    return proposals
      .filter((proposal) => proposal.targets?.some((target) => target.kind === "article" && target.key === slug))
      .filter((proposal) => fixture.role === "admin" || (proposal.mine ?? proposal.isAuthor))
      .map(proposalSummary);
  }

  function snapshot(slug, record) {
    return {
      ok: true,
      article: structuredClone(record.article),
      baseHash: record.baseHash,
      draft: record.draft ? structuredClone(record.draft) : null,
      draftVersion: record.draftVersion,
      history: structuredClone(record.history),
      proposals: articleProposals(slug),
    };
  }

  function publishConcurrently(slug, record) {
    const before = structuredClone(record.article);
    const after = structuredClone(record.article);
    after.summary = `${after.summary ?? ""}${CONCURRENT_SUMMARY_SUFFIX}`;
    const entry = revision(slug, before, after, "Summary: another admin's edit", otherAdmin, 0);
    entry.baseHash = record.baseHash;
    record.article = after;
    record.baseHash = entry.resultHash;
    record.history = [entry, ...record.history].slice(0, 4);
  }

  function read(slug) {
    const record = recordFor(slug);
    if (!record) return json(404, { error: `No substance article is stored at ${slug}.`, code: "ARTICLE_NOT_FOUND" });
    record.reads += 1;
    return json(200, snapshot(slug, record));
  }

  const refuse = (status, code, error) => json(status, { error, code });

  function write(body) {
    const slug = typeof body?.slug === "string" ? body.slug : "";
    const record = recordFor(slug);
    if (!record) return refuse(404, "ARTICLE_NOT_FOUND", `No substance article is stored at ${slug}.`);
    const action = body.action;
    if (!["saveDraft", "discardDraft", "publish", "submit", "restore"].includes(action)) return refuse(400, "DATA_REJECTED", "Choose a supported article action.");
    if ((action === "publish" || action === "restore") && fixture.role !== "admin") {
      return refuse(403, "FORBIDDEN", "Admin access is required to publish article changes.");
    }
    if (typeof body.changeId !== "string" || !body.changeId) return refuse(400, "DATA_REJECTED", "The loaded base revision and a stable change ID are required.");
    const replay = record.receipts.get(body.changeId);
    if (replay) return json(200, structuredClone(replay));
    const checkDraftVersion = () => (body.draftVersion ?? 0) !== record.draftVersion
      ? refuse(409, "ARTICLE_CONFLICT", "Your private draft changed in another tab. Reload the saved draft before saving or discarding it.")
      : null;
    let result;
    if (action === "discardDraft") {
      const refused = checkDraftVersion();
      if (refused) return refused;
      record.draftVersion += record.draft ? 1 : 0;
      record.draft = null;
      result = { discarded: true, draft: null, draftVersion: record.draftVersion, baseHash: record.baseHash, changeId: body.changeId };
    } else if (action === "saveDraft") {
      const refused = checkDraftVersion();
      if (refused) return refused;
      record.draftVersion += 1;
      record.draft = { article: structuredClone(body.article), baseHash: body.baseHash, version: record.draftVersion, updatedAt: new Date().toISOString(), ...(body.revisionOf ? { revisionOf: body.revisionOf } : {}) };
      result = { draft: { version: record.draftVersion, baseHash: body.baseHash }, draftVersion: record.draftVersion, baseHash: body.baseHash, changeId: body.changeId };
    } else {
      if (fixture.state === "conflicted" && !record.contested) {
        record.contested = true;
        publishConcurrently(slug, record);
      }
      if (body.baseHash !== record.baseHash) return refuse(409, "ARTICLE_CONFLICT", "Published content changed. Your draft is preserved; reload and reconcile before trying again.");
      const summary = typeof body.summary === "string" ? body.summary.trim() : "";
      if (!summary || summary.length > 500) return refuse(400, "ARTICLE_SUMMARY_REQUIRED", "Describe this change in 1–500 characters.");
      let proposed = body.article;
      if (action === "restore") {
        const target = record.history.find((entry) => entry.revisionId === body.revisionId);
        if (!target) return refuse(400, "ARTICLE_REVISION_MISMATCH", "This revision does not belong to this article.");
        if (target.resultHash !== record.baseHash) return refuse(409, "ARTICLE_CONFLICT", "Newer work follows this revision. Its inverse cannot overwrite that work; open a fresh edit and reconcile the desired fields instead.");
        proposed = target.before;
      }
      if (JSON.stringify(proposed) === JSON.stringify(record.article)) return refuse(400, "ARTICLE_UNCHANGED", "No article content changed.");
      if (action === "submit") {
        const id = `fixture-prop-article-${++proposalCounter}`;
        const now = new Date().toISOString();
        proposals.unshift({
          _id: id, proposerName: fixture.session.user.name, mine: true, createdAt: now, updatedAt: now, status: "submitted",
          targets: [{ kind: "article", key: slug, baseHash: record.baseHash }], liveHashes: [{ kind: "article", key: slug, hash: record.baseHash }],
          summary, diff: `# article: ${slug}\n`, comparisonMode: "submitted", comments: [],
          ...(body.revisionOf ? { revisionOf: body.revisionOf } : {}),
          ...(body.feedbackRef ? { feedbackRef: body.feedbackRef } : {}),
        });
        result = { proposalId: id, status: "submitted", changeId: body.changeId, baseHash: record.baseHash };
      } else {
        const entry = revision(slug, structuredClone(record.article), structuredClone(proposed), summary, fixture.session.user.email, 0);
        entry.createdAt = new Date().toISOString();
        entry.baseHash = record.baseHash;
        record.article = structuredClone(proposed);
        record.baseHash = entry.resultHash;
        record.history = [entry, ...record.history].slice(0, 4);
        result = {
          revisionId: entry.revisionId, article: structuredClone(record.article), baseHash: record.baseHash, changeId: body.changeId,
          publication: [{ status: "revalidated", verification: "verified" }],
        };
      }
      if (record.draft && body.draftVersion === record.draftVersion) {
        record.draftVersion += 1;
        record.draft = null;
      }
      result.draftVersion = record.draftVersion;
    }
    const answer = { ok: true, ...result };
    record.receipts.set(body.changeId, structuredClone(answer));
    return json(200, answer);
  }

  function myDrafts() {
    if (fixture.state === "empty") return [];
    recordFor("mdma");
    return [...store.entries()]
      .filter(([, record]) => record.draft)
      .map(([slug, record]) => ({ slug, title: record.draft.article.title ?? slug, updatedAt: record.draft.updatedAt }));
  }

  function route({ upper, pathname, params, body }) {
    if (pathname !== "/api/dev/article-lifecycle") return null;
    const editor = ["admin", "editor", "editor_translator"].includes(fixture.role);
    if (upper === "GET") {
      if (!editor) return toolRead(() => json(403, { error: "Editor access required." }));
      const slug = params.get("slug") ?? "";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return json(400, { error: "A valid article slug is required." });
      return toolRead(() => read(slug));
    }
    if (upper === "POST") {
      if (!editor) return toolWrite(() => json(403, { error: "Editor access required." }));
      return toolWrite(() => write(body ?? {}));
    }
    return json(405, { error: "Method not allowed." });
  }

  return { route, myDrafts };
}
