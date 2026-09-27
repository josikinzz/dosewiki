/**
 * The review workbench's records for browser journeys and screenshots of
 * `/review`: each article's human review record (`editorial_review`), its
 * current published revision, the content behind a stale sign-off, source
 * stats for the queue order, the category layout the workbench groups by, and
 * the review writes (the tick, a recommendation, Review Flags).
 *
 * Seeded so every review state has a whole article to show it on, and so a
 * bare `/review` lands on one (MDMA, the first article in home-page order that
 * is not reviewed):
 * - LSD was signed off by another admin at an older revision, so it reads
 *   "Changed since review", and its diff shows a summary and a dose change.
 *   Every other psychedelic is reviewed, so signing LSD off again finishes the
 *   Psychedelic class; `setStatus("2c-b", "needed")` first makes that tick
 *   finish only the Lysergamides section.
 * - MDMA is not reviewed and carries two flags; it is the only article in the
 *   Entactogen class, so signing it off finishes a class (the celebration).
 * - Ketamine is reviewed: an editor recommended it and another admin approved.
 * - Alcohol is on hold with a flag saying why.
 * - Heroin carries an editor's pending recommendation (the one Change Review
 *   lists), Fentanyl a stale one, Morphine and Caffeine are reviewed, so the
 *   Opioid class is one tick from done and Stimulant has a finished section.
 *
 * The route rules are the real route's: the editor floor for every write,
 * the admin floor for marking an article reviewed (403 "Admin access
 * required."), a sign-off records the revision the reviewer read or the one
 * published now, one to three words in a flag label, and the write freeze
 * (through the fixture's `toolWrite`). The route takes no revision check, so
 * `conflicted` changes nothing here; the article's own publish conflict comes
 * from the Substances lifecycle routes.
 *
 * Pure module: no Playwright and no Node imports.
 */

const HOUR = 3_600_000;

/** Each article's published revision; LSD and Fentanyl moved on after their review records. */
export function publishedRevisionFor(slug) {
  const key = slug.replace(/[^a-z0-9]/g, "");
  return `rev${key}${slug === "lsd" || slug === "fentanyl" ? 2 : 1}`;
}

/**
 * The review record per slug, built against a fixed clock. Every slug not
 * named here is not reviewed and carries no flags.
 */
export function seedReviewRecords({ epoch, otherAdmin }) {
  const at = (hours) => new Date(epoch - hours * HOUR).toISOString();
  const signed = (slug, by, hours, extra = {}) => ({
    status: "completed",
    notes: "",
    reviewed_by: by,
    reviewed_at: at(hours),
    reviewed_revision: `rev${slug.replace(/[^a-z0-9]/g, "")}1`,
    ...extra,
  });
  const flag = (label, severity, note, hours, extra = {}) => ({
    label, severity, note, source: "human", created_at: at(hours), created_by: otherAdmin, ...extra,
  });
  return {
    lsd: signed("lsd", otherAdmin, 240),
    ketamine: signed("ketamine", otherAdmin, 72, {
      recommended_by: "kayla@local.dose.wiki",
      recommended_at: at(80),
      recommendation_note: "Checked the dose table against both sources.",
    }),
    psilocybin: signed("psilocybin", otherAdmin, 300),
    mescaline: signed("mescaline", otherAdmin, 310),
    "2c-b": signed("2c-b", otherAdmin, 320),
    "25i-nbome": signed("25i-nbome", otherAdmin, 330),
    "salvinorin-a": signed("salvinorin-a", otherAdmin, 340),
    morphine: signed("morphine", otherAdmin, 400),
    caffeine: signed("caffeine", otherAdmin, 500),
    cocaine: signed("cocaine", otherAdmin, 520),
    mdma: {
      status: "needed",
      notes: "",
      flags: [
        flag("incomplete table", "major", "The insufflated route has no duration stages.", 20, { section: "dosage-duration" }),
        flag("missing citations", "note", "Two claims in the summary have no marker.", 30, { section: "summary", source: "agent", created_by: undefined }),
      ],
    },
    alcohol: {
      status: "in_progress",
      notes: "",
      flags: [flag("stale data", "minor", "Legality lists a 2019 change as pending.", 10, { section: "legality" })],
    },
    heroin: {
      status: "needed",
      notes: "",
      recommendation: {
        revision: publishedRevisionFor("heroin"),
        recommended_by: "kayla@local.dose.wiki",
        recommended_at: at(6),
        note: "Checked every interaction against the TripSit chart.",
      },
    },
    fentanyl: {
      status: "needed",
      notes: "",
      recommendation: {
        revision: "revfentanyl1",
        recommended_by: "mira@local.dose.wiki",
        recommended_at: at(90),
        note: "",
      },
    },
  };
}

/**
 * The review routes over the library rows (`rows()` is the fixture's slug to
 * row map, whose rows carry `editorial_review`), plus `wholeArticle` to build
 * the article a stale sign-off covered.
 */
export function createReviewRoutes({ fixture, json, toolRead, toolWrite, epoch, rows, layouts, wholeArticle }) {
  let clock = epoch;
  const tick = () => new Date((clock += 60_000)).toISOString();
  const recordOf = (row) => {
    row.editorial_review ??= { status: "needed", notes: "" };
    return row.editorial_review;
  };

  /** The content an older sign-off covered: LSD's summary and oral moderate dose as they were. */
  function signedArticle(row) {
    const article = wholeArticle(row) ?? structuredClone(row);
    if (row.slug === "lsd") {
      article.summary = `${article.summary ?? ""}`.split(". ").slice(0, 2).join(". ").replace(/\.?$/, ".");
      const tier = article.dosage?.routes?.[0]?.dose_ranges?.moderate;
      if (tier) article.dosage.routes[0].dose_ranges.moderate = { ...tier, min: 50, max: 100 };
    }
    return article;
  }

  function reviewChanges(slug, since) {
    const row = rows().get(slug);
    if (!row) return json(404, { ok: false, error: `No substance article is stored at ${slug}.` });
    const published = publishedRevisionFor(slug);
    if (since === published) return json(200, { ok: true, slug, revision: since, publishedRevision: published, signed: wholeArticle(row) ?? structuredClone(row), current: wholeArticle(row) ?? structuredClone(row) });
    if (since !== `rev${slug.replace(/[^a-z0-9]/g, "")}1`) {
      return json(404, { ok: false, error: "The signed revision is no longer in this article's history." });
    }
    return json(200, { ok: true, slug, revision: since, publishedRevision: published, signed: signedArticle(row), current: wholeArticle(row) ?? structuredClone(row) });
  }

  function write(body) {
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const row = rows().get(slug);
    if (!row) return json(400, { error: "A valid substance slug is required." });
    const record = recordOf(row);
    const email = fixture.session.user.email;
    const action = typeof body.action === "string" ? body.action : "status";
    if (action === "recommend") {
      record.recommendation = {
        revision: typeof body.revision === "string" ? body.revision : publishedRevisionFor(slug),
        recommended_by: email,
        recommended_at: tick(),
        note: typeof body.note === "string" ? body.note.trim() : "",
      };
      return json(200, { ok: true, slug, editorial_review: structuredClone(record) });
    }
    if (action === "add-flag") {
      const label = typeof body.flag?.label === "string" ? body.flag.label.trim() : "";
      const words = label.split(/\s+/).filter(Boolean);
      if (words.length < 1 || words.length > 3) return json(400, { error: "Flag label must contain 1–3 words." });
      if (!["major", "minor", "note"].includes(body.flag?.severity)) return json(400, { error: "Flag severity must be major, minor, or note." });
      record.flags = [
        ...(record.flags ?? []),
        { label, severity: body.flag.severity, note: String(body.flag.note ?? ""), ...(body.flag.section ? { section: body.flag.section } : {}), source: "human", created_at: tick(), created_by: email },
      ];
      return json(200, { ok: true, slug, flags: structuredClone(record.flags) });
    }
    if (action === "delete-flag") {
      const identity = body.identity ?? {};
      record.flags = (record.flags ?? []).filter((flag) => !(flag.created_at === identity.created_at && flag.label === identity.label && flag.source === identity.source));
      return json(200, { ok: true, slug, flags: structuredClone(record.flags) });
    }
    if (action !== "status" || !["needed", "in_progress", "completed"].includes(body.status)) {
      return json(400, { error: "A valid review status is required." });
    }
    if (body.status === "completed" && fixture.role !== "admin") return json(403, { error: "Admin access required." });
    if (body.status === "completed") {
      Object.assign(record, {
        status: "completed",
        reviewed_by: email,
        reviewed_at: tick(),
        reviewed_revision: typeof body.revision === "string" ? body.revision : publishedRevisionFor(slug),
      });
      delete record.recommendation;
    } else {
      record.status = body.status;
      delete record.reviewed_by;
      delete record.reviewed_at;
      delete record.reviewed_revision;
    }
    return json(200, { ok: true, slug, editorial_review: structuredClone(record) });
  }

  return {
    /** One article's stored status, for a scenario that needs another starting point. */
    setStatus(slug, status) {
      const row = rows().get(slug);
      if (!row) throw new Error(`No review record for ${slug}.`);
      const record = recordOf(row);
      record.status = status;
      if (status === "completed") Object.assign(record, { reviewed_by: fixture.session.user.email, reviewed_at: tick(), reviewed_revision: publishedRevisionFor(slug) });
    },
    /** Every article reviewed, for the finished state. */
    completeAll() {
      for (const row of rows().values()) {
        Object.assign(recordOf(row), { status: "completed", reviewed_by: fixture.session.user.email, reviewed_at: tick(), reviewed_revision: publishedRevisionFor(row.slug) });
      }
    },
    /** Every article reviewed but `slug`, so one tick finishes the corpus. */
    completeAllBut(slug) {
      for (const row of rows().values()) {
        if (row.slug === slug) continue;
        Object.assign(recordOf(row), { status: "completed", reviewed_by: fixture.session.user.email, reviewed_at: tick(), reviewed_revision: publishedRevisionFor(row.slug) });
      }
    },
    route({ upper, pathname, params, body }) {
      // The layout the workbench groups by answers in every state, like the index layouts.
      if (pathname === "/api/editor/category-layout" && upper === "GET") {
        const psychoactive = layouts().find((layout) => layout.type === "psychoactive");
        return json(200, psychoactive ? { version: psychoactive.version, categories: structuredClone(psychoactive.categories) } : null);
      }
      if (pathname === "/api/dev/review-revisions" && upper === "GET") {
        const slug = params.get("slug");
        const since = params.get("since");
        if (slug === null && since === null) {
          return toolRead(() => json(200, { ok: true, revisions: Object.fromEntries([...rows().keys()].map((key) => [key, publishedRevisionFor(key)])) }));
        }
        return toolRead(() => reviewChanges(slug ?? "", since ?? ""));
      }
      if (pathname === "/api/dev/article-source-stats" && upper === "GET") {
        return toolRead(() => json(200, { stats: [...rows().values()].map((row, index) => ({ slug: row.slug, totalTokens: 4000 + ((index * 7919) % 30_000) })) }));
      }
      if (pathname === "/api/dev/editorial-review" && upper === "POST") return toolWrite(() => write(body ?? {}));
      return null;
    },
  };
}
