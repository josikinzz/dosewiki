// Focused tests for the citation-verdict campaign helpers (verdict-lib.mjs):
// marker extraction, claim segmentation offsets, pairId stability, safety
// stamping, legality country-row exclusion, packet round-trip, and
// content-hash drift refusal. No network; fixture articles only.
//
// Run: node --test scripts/citations/verdict-audit.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIT_SCHEMA_VERSION,
  CITABLE_SECTIONS,
  CITATION_NEEDED_TOKEN,
  ContentHashDriftError,
  PACKET_SCHEMA_VERSION,
  attachExistingVerdicts,
  buildAuditRowsForArticle,
  buildAuditTotals,
  buildPairId,
  buildVerdictPacket,
  classifySafetySensitive,
  contentHash,
  extractClaimPairs,
  segmentClaims,
} from "./verdict-lib.mjs";

const SLUG = "fixture-substance";

function fixtureArticle() {
  return {
    slug: SLUG,
    title: "Fixture Substance",
    summary:
      "Alpha is a strong stimulant.[cite:ref-alpha] It was first synthesized in 1912. "
      + "Overdose can cause death.[cite:ref-beta]",
    pharmacology: {
      pharmacodynamics: "Binds the 5-HT2A receptor.[cite:ref-alpha] Metabolized hepatically.",
      pharmacokinetics: "",
      binding_sites: [],
      metabolites: [],
    },
    tolerance: {
      full_tolerance: "Tolerance develops within days. [cite:ref-gamma]",
      half_tolerance: "",
      baseline_tolerance: "",
      cross_tolerance: [],
    },
    harm_potential: {
      addiction: {
        psychological: {
          level: "moderate",
          description: "Habit-forming with frequent use.[cite:ref-alpha]",
        },
      },
    },
    history_culture: {
      content: "",
      sections: [
        {
          heading: "Origins",
          content: "First described in 1912.[cite:ref-alpha] Later prohibited worldwide.",
        },
      ],
    },
    legality: {
      international: ["Scheduled under the 1971 Convention.[cite:ref-intl]"],
      countries: {
        Germany: { status: "Illegal", notes: "Banned under the BtMG.[cite:ref-country]" },
      },
      usStates: {
        Oregon: { status: "Illegal", notes: "State-specific note.[cite:ref-state]" },
      },
      usStatesNote: "State law varies widely.[cite:ref-intl]",
    },
    references: [
      { id: "ref-alpha", title: "Alpha source", url: "https://example.org/alpha" },
      { id: "ref-beta", title: "Beta source", url: "https://example.org/beta" },
    ],
  };
}

test("extractClaimPairs captures every marker exactly once", () => {
  const article = fixtureArticle();
  const pairs = extractClaimPairs(article.summary);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs.map((pair) => pair.markerId), ["ref-alpha", "ref-beta"]);
});

test("claim segmentation binds markers and reports [start,end) offsets", () => {
  const article = fixtureArticle();
  const text = article.summary;
  const pairs = extractClaimPairs(text);

  const [alpha, beta] = pairs;
  assert.equal(alpha.claimText, "Alpha is a strong stimulant.[cite:ref-alpha]");
  assert.equal(text.slice(alpha.claimStart, alpha.claimEnd), alpha.claimText);
  assert.equal(alpha.claimStart, 0);

  assert.equal(beta.claimText, "Overdose can cause death.[cite:ref-beta]");
  assert.equal(text.slice(beta.claimStart, beta.claimEnd), beta.claimText);

  const claims = segmentClaims(text);
  assert.equal(claims.length, 3);
  assert.equal(claims[1].text, "It was first synthesized in 1912.");
});

test("a marker separated by a space still binds to the preceding sentence", () => {
  const text = "Tolerance develops within days. [cite:ref-gamma]";
  const claims = segmentClaims(text);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].text, text);
  const [pair] = extractClaimPairs(text);
  assert.equal(pair.markerId, "ref-gamma");
  assert.equal(pair.claimText, text);
});

test("segmentation treats citation-needed tokens as sentence-bound", () => {
  const text = `First claim.${CITATION_NEEDED_TOKEN} Second claim.[cite:x]`;
  const claims = segmentClaims(text);
  assert.equal(claims.length, 2);
  assert.equal(claims[0].text, `First claim.${CITATION_NEEDED_TOKEN}`);
  assert.equal(claims[1].text, "Second claim.[cite:x]");
});

test("pairId is stable and tracks claim text", () => {
  const base = { slug: SLUG, section: "summary", markerId: "ref-alpha", claimText: "Alpha." };
  const id = buildPairId(base);
  assert.match(id, /^fixture-substance:summary:ref-alpha:[0-9a-f]{12}$/);
  assert.equal(buildPairId({ ...base }), id);
  assert.notEqual(buildPairId({ ...base, claimText: "Alpha!" }), id);
  assert.notEqual(buildPairId({ ...base, markerId: "ref-beta" }), id);
});

test("safety stamping follows the contract classes", () => {
  assert.equal(classifySafetySensitive({ section: "summary", claimText: "Overdose can cause death." }), true);
  assert.equal(classifySafetySensitive({ section: "summary", claimText: "MAOI combinations are contraindicated." }), true);
  assert.equal(classifySafetySensitive({ section: "pharmacology", claimText: "High affinity for 5-HT2A." }), true);
  assert.equal(classifySafetySensitive({ section: "summary", claimText: "It is 50 to 100 times more potent than morphine." }), true);
  assert.equal(classifySafetySensitive({ section: "summary", claimText: "It has a narrow margin of error." }), true);
  assert.equal(classifySafetySensitive({ section: "summary", claimText: "First synthesized in 1912." }), false);
  // Any harm_potential claim is sensitive by default.
  assert.equal(classifySafetySensitive({ section: "harm_potential", claimText: "Mild and short-lived." }), true);
});

test("audit rows cover citable prose and exclude the legality section entirely", () => {
  const rows = buildAuditRowsForArticle({ slug: SLUG, article: fixtureArticle() });

  assert.ok(!CITABLE_SECTIONS.includes("legality"), "legality is out of campaign scope");
  const legalityRows = rows.filter((row) => row.section === "legality");
  assert.deepEqual(legalityRows, [], "no legality row of any kind may be audited");
  const markerIds = rows.map((row) => row.markerId);
  for (const excluded of ["ref-country", "ref-state", "ref-intl"]) {
    assert.ok(!markerIds.includes(excluded), `${excluded} must be excluded with the legality section`);
  }

  const harmRow = rows.find((row) => row.section === "harm_potential");
  assert.equal(harmRow.fieldPath, "harm_potential.addiction.psychological.description");
  assert.equal(harmRow.safetySensitive, true);

  // Unresolvable marker id still yields a row with null reference identity.
  const gammaRow = rows.find((row) => row.markerId === "ref-gamma");
  assert.equal(gammaRow.section, "tolerance");
  assert.equal(gammaRow.referenceId, null);
  assert.equal(gammaRow.referenceUrl, null);
  assert.equal(gammaRow.referenceTitle, null);

  const resolved = rows.find((row) => row.markerId === "ref-beta");
  assert.equal(resolved.referenceUrl, "https://example.org/beta");
  assert.equal(resolved.referenceTitle, "Beta source");

  for (const row of rows) {
    assert.ok(CITABLE_SECTIONS.includes(row.section));
    assert.equal(row.existingVerdict, null);
    assert.equal(row.actionable, true);
    assert.equal(row.contentHash, contentHash(fixtureArticle()[row.section]));
  }

  // Deterministic reruns.
  assert.deepEqual(buildAuditRowsForArticle({ slug: SLUG, article: fixtureArticle() }), rows);
});

test("attachExistingVerdicts matches claimKey=pairId and flips actionable", () => {
  const rows = buildAuditRowsForArticle({ slug: SLUG, article: fixtureArticle() });
  const judged = rows.find((row) => row.markerId === "ref-beta");
  const evidence = [{
    slug: SLUG,
    section: judged.section,
    claimKey: judged.pairId,
    referenceIds: ["ref-beta"],
    status: "needs_source",
    statusReason: "verdict:partial — weaker figure in source",
    severity: "blocking",
    updatedAt: "2026-08-30T00:00:00.000Z",
  }];
  const attached = attachExistingVerdicts(rows, evidence);
  const hit = attached.find((row) => row.pairId === judged.pairId);
  assert.equal(hit.actionable, false);
  assert.equal(hit.existingVerdict.status, "needs_source");
  assert.equal(hit.existingVerdict.statusReason, "verdict:partial — weaker figure in source");
  for (const row of attached.filter((entry) => entry.pairId !== judged.pairId)) {
    assert.equal(row.existingVerdict, null);
    assert.equal(row.actionable, true);
  }
});

test("audit totals count pairs, actionable, sections, and sensitivity", () => {
  const article = fixtureArticle();
  const rows = buildAuditRowsForArticle({ slug: SLUG, article });
  const totals = buildAuditTotals(rows);
  assert.equal(totals.pairs, rows.length);
  assert.equal(totals.actionable, rows.length);
  assert.equal(totals.publicArticles, 1);
  assert.equal(totals.perSlug[SLUG], rows.length);
  assert.equal(totals.bySection.summary, 2);
  assert.ok(!("legality" in totals.bySection), "totals must not report a legality section");
  assert.equal(totals.sensitiveCount, rows.filter((row) => row.safetySensitive).length);
  assert.equal(AUDIT_SCHEMA_VERSION, "dosewiki_citation_verdict_audit_v1");
});

test("verdict packet round-trips against the audit", () => {
  const article = fixtureArticle();
  const auditRows = buildAuditRowsForArticle({ slug: SLUG, article });
  const packet = buildVerdictPacket({
    slug: SLUG,
    section: "summary",
    article,
    auditRows,
    evidenceRows: [
      { slug: SLUG, section: "summary", claimKey: "x", status: "supported" },
      { slug: SLUG, section: "pharmacology", claimKey: "y", status: "supported" },
    ],
    generatedAt: "2026-08-31T00:00:00.000Z",
  });
  assert.equal(packet.schemaVersion, PACKET_SCHEMA_VERSION);
  assert.equal(packet.slug, SLUG);
  assert.equal(packet.section, "summary");
  assert.deepEqual(packet.pairs, auditRows.filter((row) => row.section === "summary"));
  assert.equal(packet.contentHash, contentHash(article.summary));
  assert.deepEqual(packet.references.map((ref) => ref.id).sort(), ["ref-alpha", "ref-beta"]);
  assert.equal(packet.evidenceRows.length, 1);
  assert.equal(packet.evidenceRows[0].section, "summary");
});

test("verdict packet refuses on live content-hash drift with a named error", () => {
  const article = fixtureArticle();
  const auditRows = buildAuditRowsForArticle({ slug: SLUG, article });
  const tampered = structuredClone(article);
  tampered.summary += " Tampered sentence.";
  assert.throws(
    () => buildVerdictPacket({ slug: SLUG, section: "summary", article: tampered, auditRows }),
    (error) => {
      assert.equal(error.name, "ContentHashDriftError");
      assert.ok(error instanceof ContentHashDriftError);
      assert.equal(error.details.slug, SLUG);
      assert.equal(error.details.section, "summary");
      return true;
    },
  );
  // Unchanged sections still export.
  const packet = buildVerdictPacket({ slug: SLUG, section: "tolerance", article: tampered, auditRows });
  assert.equal(packet.pairs.length, 1);
});
