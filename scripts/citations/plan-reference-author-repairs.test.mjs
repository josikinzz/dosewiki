import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { enrichKnownReferenceCandidatesWithDiagnostics } from "./formal-citations-reference-enrichment.mjs";
import {
  buildCitationAuthorRepairProposal,
  classifyAuthorRepairCandidate,
  runCitationAuthorRepairProposal,
  sha256Json,
  writeImmutableProposal,
} from "./plan-reference-author-repairs.mjs";

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function reference(overrides = {}) {
  return {
    id: "pmid-19322953",
    type: "journal_article",
    title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
    authors: [],
    pmid: "19322953",
    ...overrides,
  };
}

function article(ref = reference()) {
  return {
    slug: "methylphenidate",
    title: "Methylphenidate",
    summary: `Summary [cite:${ref.id}].`,
    references: [ref],
  };
}

function enrichmentResult(candidate, overrides = {}, issues = []) {
  const enriched = {
    ...candidate,
    authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
    metadataProvenance: [{ provider: candidate.doi ? "crossref" : "pubmed", status: "success" }],
    metadataDiagnostics: issues,
    ...overrides,
  };
  return {
    references: [enriched],
    diagnostics: [{ referenceId: candidate.id, providers: enriched.metadataProvenance, issues }],
  };
}

describe("citation author repair proposal", () => {
  it("builds a deterministic high-confidence pmid-19322953 proposal with CAS snapshot", async () => {
    const proposal = await buildCitationAuthorRepairProposal({
      articles: [article()],
      sourceDeployment: "example/dosewiki",
      generatedAt: "2026-08-09T00:00:00.000Z",
      enrich: async ([candidate]) => enrichmentResult(candidate),
    });

    expect(proposal.summary).toEqual({
      articleCount: 1,
      candidateCount: 1,
      highConfidenceCount: 1,
      residualCount: 0,
      residualReasonCounts: {},
    });
    expect(proposal.highConfidence[0]).toMatchObject({
      key: "methylphenidate::pmid-19322953",
      classification: "high_confidence",
      reasonCodes: ["identifier_and_title_match"],
      expectedAuthors: [],
      proposedAuthors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
      identifiers: { doi: null, pmid: "19322953" },
    });
    expect(proposal.highConfidence[0].expectedReferenceSha256).toBe(sha256Json(reference()));
    expect(proposal).toEqual({
      artifactType: "citation_author_repair_proposal",
      artifactVersion: 1,
      generatedAt: "2026-08-09T00:00:00.000Z",
      sourceDeployment: "example/dosewiki",
      mode: "dry_run",
      summary: proposal.summary,
      highConfidence: proposal.highConfidence,
      residual: [],
      artifactSha256: proposal.artifactSha256,
    });
  });

  it("classifies title conflicts and no-author provider results as residual", async () => {
    const titleConflict = await buildCitationAuthorRepairProposal({ articles: [article()], sourceDeployment: "example/dosewiki", generatedAt: "2026-08-09T00:00:00.000Z",
    enrich: async ([candidate]) => enrichmentResult(candidate, { title: "A different paper" }), });
    expect(titleConflict.residual[0].reasonCodes).toEqual(["title_conflict"]);

    const noAuthors = await buildCitationAuthorRepairProposal({ articles: [article()], sourceDeployment: "example/dosewiki", generatedAt: "2026-08-09T00:00:00.000Z",
    enrich: async ([candidate]) => enrichmentResult(candidate, { authors: [] }), });
    expect(noAuthors.residual[0].reasonCodes).toEqual(["no_authors_returned"]);
  });

  it("detects DOI and PMID provider disagreement", async () => {
    const dual = reference({ doi: "10.1000/example" });
    const proposal = await buildCitationAuthorRepairProposal({ articles: [article(dual)], sourceDeployment: "example/dosewiki", generatedAt: "2026-08-09T00:00:00.000Z",
    enrich: async ([candidate]) => enrichmentResult(candidate, {
      authors: candidate.doi ? ["Crossref Author"] : ["PubMed Author"],
    }), });
    expect(proposal.residual[0]).toMatchObject({
      reasonCodes: ["provider_disagreement"],
      proposedAuthors: [],
    });
    expect(proposal.residual[0].providerLanes).toHaveLength(2);
  });

  it("keeps DOI and PMID provider lanes isolated when the stored URL contains the DOI", async () => {
    const title = "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor";
    const dual = reference({
      doi: "10.1000/example",
      url: "https://doi.org/10.1000/example",
    });
    const fetchImpl = vi.fn(async (url) => {
      if (url.startsWith("https://api.crossref.org/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: {
              title: [title],
              author: [{ given: "Crossref", family: "Author" }],
              type: "journal-article",
            },
          }),
        };
      }
      if (url.startsWith("https://eutils.ncbi.nlm.nih.gov/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              "19322953": {
                title,
                authors: [{ name: "PubMed Author" }],
              },
            },
          }),
        };
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });

    const proposal = await buildCitationAuthorRepairProposal({ articles: [article(dual)], sourceDeployment: "example/dosewiki", generatedAt: "2026-08-09T00:00:00.000Z",
    enrich: (candidates, options) => enrichKnownReferenceCandidatesWithDiagnostics(candidates, {
      ...options,
      fetchImpl,
      maxAttempts: 1,
    }), });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://api.crossref.org/works/10.1000%2Fexample",
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=19322953&retmode=json",
    ]);
    expect(proposal.residual[0]).toMatchObject({
      reasonCodes: ["provider_disagreement"],
      proposedAuthors: [],
    });
    expect(proposal.residual[0].providerLanes).toEqual([
      expect.objectContaining({ providerLane: "doi", authors: ["Crossref Author"] }),
      expect.objectContaining({ providerLane: "pmid", authors: ["PubMed Author"] }),
    ]);
  });

  it("includes marker-linked authorless scholarly references without stable identifiers without network requests", async () => {
    const enrich = vi.fn();
    const noIdentifier = reference({
      id: "journal-without-identifier",
      pmid: null,
      journal: "Example Journal",
      volume: "12",
    });
    const proposal = await buildCitationAuthorRepairProposal({ articles: [article(noIdentifier)], sourceDeployment: "example/dosewiki", generatedAt: "2026-08-09T00:00:00.000Z",
    enrich, });

    expect(enrich).not.toHaveBeenCalled();
    expect(proposal.residual).toHaveLength(1);
    expect(proposal.residual[0]).toMatchObject({
      key: "methylphenidate::journal-without-identifier",
      reasonCodes: ["missing_stable_identifier"],
      providerLanes: [],
    });
  });

  it("routes shared-identity duplicates to residual review without network requests", async () => {
    const enrich = vi.fn();
    const candidate = reference({ doi: "https://doi.org/10.1000/example" });
    const duplicate = {
      ...candidate,
      id: "cached-duplicate",
      doi: "10.1000/EXAMPLE",
      authors: ["Existing Author"],
    };
    const duplicateArticle = article(candidate);
    duplicateArticle.references.push(duplicate);
    const proposal = await buildCitationAuthorRepairProposal({ articles: [duplicateArticle], sourceDeployment: "example/dosewiki", generatedAt: "2026-08-09T00:00:00.000Z",
    enrich, });

    expect(enrich).not.toHaveBeenCalled();
    expect(proposal.residual[0]).toMatchObject({
      reasonCodes: ["duplicate_reference"],
      duplicateReferenceIds: ["cached-duplicate"],
      providerLanes: [],
    });
  });

  it("classifies missing identifiers, provider failures, and institutional authors for manual review", () => {
    expect(classifyAuthorRepairCandidate({ reference: reference({ pmid: null }), lanes: [] })).toEqual({
      classification: "residual",
      reasonCodes: ["missing_stable_identifier"],
      proposedAuthors: [],
    });
    expect(classifyAuthorRepairCandidate({
      reference: reference(),
      lanes: [{
        providerLane: "pmid",
        reference: reference({ authors: ["Markowitz JS"] }),
        diagnostics: { issues: [{ code: "primary_provider_failed" }] },
      }],
    })).toEqual({
      classification: "residual",
      reasonCodes: ["provider_failure"],
      proposedAuthors: [],
    });
    expect(classifyAuthorRepairCandidate({
      reference: reference(),
      lanes: [{
        providerLane: "pmid",
        reference: reference({ authors: ["Methylphenidate Study Group"] }),
        diagnostics: { issues: [] },
      }],
    })).toEqual({
      classification: "residual",
      reasonCodes: ["institutional_authorship"],
      proposedAuthors: ["Methylphenidate Study Group"],
    });
  });

  it("drains every lookup page before loading articles by slug", async () => {
    const lookupQuery = { name: "lookup-page" };
    const bySlugQuery = { name: "by-slug" };
    const query = vi.fn(async (queryReference, args) => {
      if (queryReference === lookupQuery) {
        if (args.paginationOpts.cursor === null) {
          return { page: [{ slug: "alpha" }], isDone: false, continueCursor: "page-2" };
        }
        return { page: [{ slug: "beta" }], isDone: true, continueCursor: null };
      }
      if (queryReference === bySlugQuery) {
        return { slug: args.slug, title: args.slug, references: [] };
      }
      throw new Error("Unexpected query reference");
    });
    const writeProposal = vi.fn();

    const result = await runCitationAuthorRepairProposal(
      ["--output=tmp/test-proposal.json"],
      {
        env: { DATA_BACKEND: "postgres", SOURCE_POSTGRES_URL: "postgres://test-source/dosewiki" },
        client: { query },
        api: { substanceIndex: { getLookupPage: lookupQuery, getBySlug: bySlugQuery } },
        generatedAt: "2026-08-09T00:00:00.000Z",
        writeProposal,
        logger: { log: vi.fn() },
      },
    );

    expect(query.mock.calls.slice(0, 2)).toEqual([
      [lookupQuery, { paginationOpts: { cursor: null, numItems: 32 } }],
      [lookupQuery, { paginationOpts: { cursor: "page-2", numItems: 32 } }],
    ]);
    expect(query.mock.calls.slice(2)).toEqual([
      [bySlugQuery, { slug: "alpha" }],
      [bySlugQuery, { slug: "beta" }],
    ]);
    expect(result.proposal.summary.candidateCount).toBe(0);
    expect(writeProposal).toHaveBeenCalledOnce();
  });

  it("writes artifacts exclusively and refuses overwrite", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "citation-author-proposal-"));
    temporaryDirectories.push(directory);
    const output = resolve(directory, "proposal.json");
    const proposal = await buildCitationAuthorRepairProposal({ articles: [article()], sourceDeployment: "example/dosewiki", generatedAt: "2026-08-09T00:00:00.000Z",
    enrich: async ([candidate]) => enrichmentResult(candidate), });
    writeImmutableProposal(output, proposal);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual(proposal);
    expect(() => writeImmutableProposal(output, proposal)).toThrow();
  });
});
