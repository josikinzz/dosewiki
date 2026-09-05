import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  PRODUCTION_URL, createCampaignReader, auditCampaign, initCampaign, nextPackets,
  ingestReply, campaignStatus, verifyCampaign, retryTask, rejectTask, recordReceipt, parseCampaignArgs,
} from "./campaign.mjs";
import { substantiveExcerpt, isSourcePoorMarker, sourceBlocks, selectExactBlocks, parseWriterOutput } from "./evidence.mjs";
import { GENERATION_SECTIONS, GENERATION_MODEL, GENERATION_THINKING, isRegenerationEligible } from "../../lib/sectionGeneration/contract.mjs";
import { sectionKeyToPromptKey } from "../../scripts/lib/prompt-registry.mjs";
import { canonicalHash, computeReviewedArtifactDigest, computeSectionCasHash } from "../../scripts/batch/proposal/core.mjs";
import { publicationFieldsForProfile } from "../../lib/generatedPublication/profiles.mjs";

const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function article(overrides = {}) {
  return { _id: "article-1", _creationTime: 1, id: 1, slug: "test-drug", title: "Test drug", priority: "low",
    index_categories: [], summary: "Old unrelated claim.[cite:old]", pharmacology: {}, tolerance: {}, harm_potential: {},
    history_culture: null, legality: { countries: { US: { notes: "Must survive.[cite:law]" } } },
    references: [{ id: "old", title: "Existing reference" }, { id: "law", title: "Legal reference" }],
    dosage: { routes: [] }, duration: { routes: [] }, editorial_review: { status: "completed" }, ...overrides };
}
function fixture({ articles = [article()], quotes = [{ slug: "test-drug", section: "summary", content: "A documented fact." }], sources = null } = {}) {
  const runDir = mkdtempSync(resolve(tmpdir(), "section-generation-")); directories.push(runDir);
  const data = { articles, quotes, sources, prompts: GENERATION_SECTIONS.map((section) => ({ key: sectionKeyToPromptKey(section), content: `Exact registered ${section} prompt.` })) };
  const calls = [];
  const convexApi = { substanceIndex: { getFullDocumentPage: "articles", getBySlug: "article" }, prompts: { getAll: "prompts" }, quotes: { getBySlug: "quotes" }, articleSources: { getBySlug: "sources" } };
  const client = { query: async (reference, args) => {
    calls.push({ reference, args });
    if (reference === "articles") {
      const offset = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) : 0;
      return structuredClone({ page: data.articles.slice(offset, offset + 1), isDone: offset + 1 >= data.articles.length, continueCursor: String(offset + 1) });
    }
    if (reference === "article") {
      const matches = data.articles.filter((entry) => entry.slug === args.slug);
      return matches.length === 1 ? structuredClone(matches[0]) : null;
    }
    if (reference === "prompts") return structuredClone(data.prompts);
    if (reference === "quotes") return structuredClone(data.quotes.filter((quote) => quote.slug === args.slug));
    if (reference === "sources") return data.sources?.slug === args.slug ? structuredClone(data.sources) : null;
    throw new Error(`Unexpected query: ${reference}`);
  }, mutation: () => { throw new Error("Campaign must never mutate Convex"); } };
  const reader = createCampaignReader({ client, convexApi, extractionPrompt: (section) => `Extract ${section} relevant evidence.` });
  return { runDir, reader, data, calls };
}
function reply(packet, rawText) {
  return { rawText, model: GENERATION_MODEL, thinking: GENERATION_THINKING, provider: "openai-codex",
    accountId: "opaque-test-account", tools: [], inputHash: packet.inputHash,
    startedAt: "2026-09-04T00:00:00.000Z", completedAt: "2026-09-04T00:00:01.000Z" };
}
async function dispatch(f) { await initCampaign(f); return (await nextPackets(f))[0]; }
function sourceDocument() {
  return { slug: "test-drug", substanceName: "Test drug", sources: [{ id: "one", displayName: "Source one" }, { id: "two", displayName: "Source two" }],
    contents: { one: "First fact.\n\nSecond fact.\n", two: "Third fact." } };
}

describe("section regeneration campaign", () => {
  it("selects all low/hide/hidden rows, including completed articles, but never public rows or legality", async () => {
    const f = fixture({ articles: [article(), article({ _id: "2", id: 2, slug: "hidden", priority: "high", index_categories: [" HiDdEn "] }),
      article({ _id: "3", id: 3, slug: "hidden-priority", priority: "hide_for_now" }), article({ _id: "4", id: 4, slug: "public", priority: "normal" })] });
    expect(isRegenerationEligible(f.data.articles[1])).toBe(true);
    expect(await auditCampaign(f)).toMatchObject({ articleCount: 4, eligibleCount: 3, taskCount: 15 });
    const state = await initCampaign(f);
    expect(state.tasks).toHaveLength(15);
    expect(state.tasks.some((task) => task.section === "legality" || task.slug === "public")).toBe(false);
    expect(state.tasks.find((task) => task.id === "test-drug/summary").status).toBe("pending");
    expect(f.calls.filter((call) => call.reference === "articles").length).toBeGreaterThan(1);
  });

  it("rejects duplicate and missing canonical article identities before campaign creation", async () => {
    const duplicate = fixture({ articles: [article(), article({ _id: "duplicate", id: 2 })] });
    await expect(initCampaign(duplicate)).rejects.toThrow("Duplicate");
    const missing = fixture({ articles: [article({ slug: undefined })] });
    await expect(auditCampaign(missing)).rejects.toThrow("identity");
    const number = fixture({ articles: [article(), article({ slug: "other", _id: "other" })] });
    await expect(auditCampaign(number)).rejects.toThrow("Duplicate");
  });

  it("replaces nonempty cited prose without reattaching markers and preserves every other field", async () => {
    const f = fixture(); const before = structuredClone(f.data.articles[0]); const packet = await dispatch(f);
    expect(packet.stage).toBe("write");
    expect(packet.inputHash).toBe(canonicalHash(packet.messages));
    expect(JSON.stringify(packet.messages)).not.toContain("Old unrelated claim");
    expect(JSON.stringify(packet.messages)).not.toContain("Legal reference");
    const task = await ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, "summary: A documented fact.\n") });
    expect(task.status).toBe("needs_review");
    const proposal = JSON.parse(readFileSync(task.proposalPath, "utf8"));
    expect(proposal.proposedArticle.summary).toBe("A documented fact.");
    expect(proposal.proposedArticle.legality).toEqual(before.legality);
    expect(proposal.proposedArticle.references).toEqual(before.references);
    expect(proposal.approvedPaths).toEqual(["summary"]);
    expect(proposal.sourceArtifactKind).toBe("excerpt_section_regeneration");
    expect(proposal.regenerationAudit).toMatchObject({ version: "excerpt-section-regeneration-v1", section: "summary", model: GENERATION_MODEL, thinking: "low" });
    expect(computeReviewedArtifactDigest(proposal)).toBe(proposal.artifactDigest);
    expect(f.data.articles[0]).toEqual(before);
    expect((await verifyCampaign(f)).completed).toBe(false);
    expect(campaignStatus(f).actionableCount).toBe(1);
  });

  it("accepts publication only with matching receipt and fresh live readback", async () => {
    const f = fixture(); const packet = await dispatch(f);
    const task = await ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, "summary: A documented fact.") });
    const receipt = { status: "updated", artifactDigest: task.artifactDigest, proposalId: `reviewed-section-${task.artifactDigest}` };
    await expect(recordReceipt({ ...f, taskId: task.id, receipt })).rejects.toThrow("readback");
    f.data.articles[0].summary = "A documented fact.";
    await expect(recordReceipt({ ...f, taskId: task.id, receipt: { ...receipt, artifactDigest: "0".repeat(64) } })).rejects.toThrow("receipt");
    expect((await recordReceipt({ ...f, taskId: task.id, receipt })).status).toBe("verified");
    expect((await verifyCampaign(f)).completed).toBe(true);
    f.data.articles[0].summary = "Later conflicting edit.";
    expect((await verifyCampaign(f)).completed).toBe(false);
  });

  it("requires a fresh accepted generation even for no-change completion", async () => {
    const f = fixture({ articles: [article({ summary: "A documented fact." })] });
    await initCampaign(f);
    expect((await verifyCampaign(f)).completed).toBe(false);
    const packet = (await nextPackets(f))[0];
    const task = await ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, "summary: A documented fact.") });
    expect(task.status).toBe("no_change");
    expect((await verifyCampaign(f)).completed).toBe(true);
    expect(await nextPackets(f)).toEqual([]);
  });

  it.each(["needs_review", "no_change"])("archives a rejected %s candidate and requires fresh generation", async (status) => {
    const f = fixture({ articles: [article(status === "no_change" ? { summary: "A documented fact." } : {})] });
    const packet = await dispatch(f);
    const accepted = await ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, "summary: A documented fact.") });
    expect(accepted.status).toBe(status);
    const rejected = await rejectTask({ ...f, taskId: packet.taskId, reason: "Candidate lacks necessary precision" });
    expect(rejected.status).toBe("pending");
    for (const key of ["acceptedHash", "proposalPath", "receiptHash", "artifactDigest", "proposedOwnedHash"]) {
      expect(rejected).not.toHaveProperty(key);
    }
    const rejection = JSON.parse(readFileSync(resolve(f.runDir, "objects", `${rejected.attempts.at(-1).rejectionHash}.json`), "utf8"));
    expect(rejection.reason).toBe("Candidate lacks necessary precision");
    const archived = JSON.parse(readFileSync(resolve(f.runDir, "objects", `${rejection.previousTaskHash}.json`), "utf8"));
    expect(archived.acceptedHash).toBe(accepted.acceptedHash);
    expect(archived.artifactDigest).toBe(accepted.artifactDigest);
    const fresh = (await nextPackets(f))[0];
    expect(fresh.packetDigest).not.toBe(packet.packetDigest);
    expect(fresh.inputHash).toBe(packet.inputHash);
    expect(fresh.stage).toBe("write");
    expect(fresh.attempt).toBe(2);
    expect((await verifyCampaign(f)).completed).toBe(false);
  });

  it("keeps missing evidence and explicit source-poor results unchanged with terminal provenance", async () => {
    const f = fixture({ quotes: [{ slug: "test-drug", section: "summary", content: "# Intro\n\n*No relevant information found.*" }] });
    const before = structuredClone(f.data.articles);
    const state = await initCampaign(f);
    expect(state.counts.unavailable).toBe(5);
    expect(state.tasks[0].reason).toBe("stored_source_poor_marker_preserved_unchanged");
    expect(await nextPackets(f)).toEqual([]);
    expect((await verifyCampaign(f)).completed).toBe(true);
    expect(f.data.articles).toEqual(before);
    const empty = fixture(); const packet = await dispatch(empty);
    const result = await ingestReply({ ...empty, packetDigest: packet.packetDigest, output: reply(packet, 'summary: ""') });
    expect(result).toMatchObject({ status: "unavailable", reason: "empty_generation_source_poor_preserved_unchanged" });
    expect(empty.data.articles[0].summary).toContain("Old unrelated claim");
  });

  it("extracts from available sources despite a stale source-poor quote marker", async () => {
    const f = fixture({ quotes: [{ slug: "test-drug", section: "summary", content: "*No relevant information found.*" }],
      sources: sourceDocument() });
    const packet = await dispatch(f);
    expect(packet.taskId).toBe("test-drug/summary");
    expect(packet.stage).toBe("extract");
    expect(packet.messages[1].content).toContain("First fact.");
    expect(campaignStatus(f).tasks[0].status).toBe("dispatched");
  });

  it("extracts exact selected blocks locally and isolates the subsequent writer", async () => {
    const f = fixture({ quotes: [], sources: sourceDocument() });
    const packet = await dispatch(f);
    expect(packet.stage).toBe("extract");
    expect(packet.messages[1].content).toContain("B000001");
    const output = reply(packet, '{"selectedBlockIds":["B000002"]}');
    await ingestReply({ ...f, packetDigest: packet.packetDigest, output });
    const writer = (await nextPackets(f))[0];
    expect(writer.stage).toBe("write");
    expect(writer.messages[1].content).toContain("Second fact.\n");
    expect(writer.messages[1].content).not.toContain("First fact.");
    expect(writer.messages[1].content).not.toContain("Third fact.");
    expect(writer.messages[1].content).not.toContain("selectedBlockIds");
    expect(f.data.quotes).toEqual([]);
    const accepted = await ingestReply({ ...f, packetDigest: writer.packetDigest, output: reply(writer, "summary: Second fact.") });
    const rejected = await rejectTask({ ...f, taskId: writer.taskId, reason: "Revise wording" });
    expect(rejected.extractionHash).toBe(accepted.extractionHash);
    expect((await nextPackets(f))[0].stage).toBe("write");
  });

  it("rejects unknown extraction IDs and keeps failed tasks actionable", async () => {
    const f = fixture({ quotes: [], sources: sourceDocument() }); const packet = await dispatch(f);
    await expect(ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, '{"selectedBlockIds":["B999999"]}') })).rejects.toThrow("IDs");
    expect(campaignStatus(f).tasks[0].status).toBe("failed");
    expect((await verifyCampaign(f)).completed).toBe(false);
    await retryTask({ ...f, taskId: packet.taskId, reason: "Correct extraction IDs" });
    const retry = (await nextPackets(f))[0];
    expect(retry.packetDigest).not.toBe(packet.packetDigest);
    expect(retry.attempt).toBe(2);
  });

  it("resumes durable dispatch without duplicate work and explicitly revokes abandoned packets", async () => {
    const f = fixture(); const packet = await dispatch(f);
    expect(await nextPackets(f)).toEqual([]);
    expect(campaignStatus(f).tasks[0].status).toBe("dispatched");
    await retryTask({ ...f, taskId: packet.taskId, reason: "Interrupted parent" });
    const resumed = (await nextPackets(f))[0];
    await expect(ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, "summary: Old response.") })).rejects.toThrow("stale");
    await ingestReply({ ...f, packetDigest: resumed.packetDigest, output: reply(resumed, "summary: A documented fact.") });
    expect(campaignStatus(f).tasks[0].status).toBe("needs_review");
    expect(await nextPackets(f)).toEqual([]);
  });

  it("serializes competing parent dispatches with a fail-closed local lock", async () => {
    const f = fixture(); await initCampaign(f);
    const results = await Promise.allSettled([nextPackets(f), nextPackets(f)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected.reason.message).toContain("locked");
    expect(campaignStatus(f).counts.dispatched).toBe(1);
  });

  it("reuses an accepted output after resolved drift without bypassing review", async () => {
    const f = fixture(); const packet = await dispatch(f);
    const accepted = await ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, "summary: A documented fact.") });
    f.data.articles[0].summary = "Temporary conflicting edit.";
    await verifyCampaign(f);
    f.data.articles[0].summary = "A documented fact.";
    const reused = await retryTask({ ...f, taskId: packet.taskId, reason: "Drift resolved to proposed content" });
    expect(reused.acceptedHash).toBe(accepted.acceptedHash);
    expect(reused.status).toBe("needs_review");
    expect(reused.artifactDigest).toBe(accepted.artifactDigest);
    expect(await nextPackets(f)).toEqual([]);
    expect((await verifyCampaign(f)).completed).toBe(false);
  });

  it("invalidates downstream gates on prompt drift and refreshes only through explicit retry", async () => {
    const f = fixture(); const packet = await dispatch(f);
    f.data.prompts[0].content += " Changed.";
    await expect(ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, "summary: A documented fact.") })).rejects.toThrow("drift");
    expect(campaignStatus(f).tasks[0].status).toBe("drift");
    await retryTask({ ...f, taskId: packet.taskId, reason: "Adopt updated prompt" });
    const replacement = (await nextPackets(f))[0];
    expect(replacement.messages[1].content).toContain("Changed.");
    expect(replacement.inputHash).not.toBe(packet.inputHash);
  });

  it("blocks protected and legality drift, including when all tasks had been terminal", async () => {
    const f = fixture({ quotes: [] }); await initCampaign(f);
    expect((await verifyCampaign(f)).completed).toBe(true);
    f.data.articles[0].legality.countries.US.notes = "Outside edit";
    const status = await verifyCampaign(f);
    expect(status.completed).toBe(false);
    expect(status.counts.drift).toBe(5);
    await expect(retryTask({ ...f, taskId: "test-drug/summary", reason: "Cannot erase protected drift" })).rejects.toThrow("protected drift");
  });

  it("discovers newly eligible live rows in the final audit instead of claiming stale completion", async () => {
    const f = fixture({ quotes: [] }); await initCampaign(f);
    f.data.articles.push(article({ _id: "2", id: 2, slug: "new" }));
    f.data.quotes.push({ slug: "new", section: "summary", content: "New evidence." });
    const status = await verifyCampaign(f);
    expect(status.taskCount).toBe(10);
    expect(status.completed).toBe(false);
    expect(status.tasks.find((task) => task.id === "new/summary").status).toBe("pending");
  });

  it("isolates per-task ingestion and rejection from unrelated quote/source failures and discovery", async () => {
    const f = fixture({ articles: [article(), article({ _id: "other", id: 2, slug: "other" })] });
    const packet = await dispatch(f);
    f.data.articles.push(article({ _id: "new", id: 3, slug: "new" }));
    const affectedOnlyReader = {
      ...f.reader,
      quotes: (slug) => {
        if (slug !== "test-drug") throw new Error("Unrelated quotes unavailable");
        return f.reader.quotes(slug);
      },
      sources: (slug) => {
        if (slug !== "test-drug") throw new Error("Unrelated sources unavailable");
        return f.reader.sources(slug);
      },
    };
    const readsBefore = f.calls.length;
    const accepted = await ingestReply({ ...f, reader: affectedOnlyReader, packetDigest: packet.packetDigest,
      output: reply(packet, "summary: A documented fact.") });
    expect(accepted.status).toBe("needs_review");
    expect(campaignStatus(f).taskCount).toBe(10);
    expect((await rejectTask({ ...f, reader: affectedOnlyReader, taskId: packet.taskId, reason: "Revise" })).status).toBe("pending");
    expect(f.calls.slice(readsBefore).some((call) => call.reference === "articles")).toBe(false);
    expect(f.calls.slice(readsBefore).filter((call) => call.reference === "article"))
      .toEqual([{ reference: "article", args: { slug: "test-drug" } }, { reference: "article", args: { slug: "test-drug" } }]);
    await expect(verifyCampaign({ ...f, reader: affectedOnlyReader })).rejects.toThrow("Unrelated");
    expect((await verifyCampaign(f)).taskCount).toBe(15);
  });

  it.each(["missing", "duplicate"])("treats an exact-one target lookup returning null for %s as drift", async (mode) => {
    const f = fixture(); const packet = await dispatch(f);
    if (mode === "missing") f.data.articles = [];
    else f.data.articles.push(article({ _id: "duplicate", id: 2 }));
    await expect(ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, "summary: A documented fact.") }))
      .rejects.toThrow("drift");
    expect(campaignStatus(f).tasks[0]).toMatchObject({ status: "drift", reason: "article_missing" });
  });

  it("rejects a mismatched target slug instead of accepting another article", async () => {
    const f = fixture(); const packet = await dispatch(f);
    const reader = { ...f.reader, article: async () => article({ slug: "other" }) };
    await expect(ingestReply({ ...f, reader, packetDigest: packet.packetDigest, output: reply(packet, "summary: A documented fact.") }))
      .rejects.toThrow("slug mismatch");
  });

  it("keeps retry and publication receipt reads target-local", async () => {
    const f = fixture(); const packet = await dispatch(f);
    let readsBefore = f.calls.length;
    await retryTask({ ...f, taskId: packet.taskId, reason: "Interrupted dispatch" });
    expect(f.calls.slice(readsBefore).some((call) => call.reference === "articles")).toBe(false);
    const fresh = (await nextPackets(f))[0];
    const accepted = await ingestReply({ ...f, packetDigest: fresh.packetDigest, output: reply(fresh, "summary: A documented fact.") });
    f.data.articles[0].summary = "A documented fact.";
    readsBefore = f.calls.length;
    await recordReceipt({ ...f, taskId: fresh.taskId, receipt: {
      status: "updated", artifactDigest: accepted.artifactDigest, proposalId: `reviewed-section-${accepted.artifactDigest}`,
    } });
    expect(f.calls.slice(readsBefore).some((call) => call.reference === "articles")).toBe(false);
  });

  it("rejects provider receipt mismatches and artifact tampering", async () => {
    const f = fixture(); const packet = await dispatch(f);
    await expect(ingestReply({ ...f, packetDigest: packet.packetDigest, output: { ...reply(packet, "summary: Fact."), tools: ["read"] } })).rejects.toThrow("receipt");
    const other = fixture(); const otherPacket = await dispatch(other);
    const pointer = JSON.parse(readFileSync(resolve(other.runDir, "state.json"), "utf8"));
    const state = JSON.parse(readFileSync(resolve(other.runDir, "objects", `${pointer.digest}.json`), "utf8"));
    const snapshotPath = resolve(other.runDir, "objects", `${state.tasks[otherPacket.taskId].snapshotHash}.json`);
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")); snapshot.quote.content = "Tampered evidence";
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
    expect(() => campaignStatus(other)).toThrow("digest mismatch");
  });

  it("rejects duplicate quote and prompt records rather than selecting the first", async () => {
    const f = fixture(); f.data.quotes.push({ ...f.data.quotes[0] });
    await expect(initCampaign(f)).rejects.toThrow("quote identity");
    const other = fixture(); other.data.prompts.push({ ...other.data.prompts[0] });
    await expect(initCampaign(other)).rejects.toThrow("prompt identity");
  });

  it("uses the pharmacology publication CAS including dosage/duration without editing them", async () => {
    const f = fixture({ quotes: [{ slug: "test-drug", section: "pharmacology", content: "Receptor agonist." }] });
    const packet = await dispatch(f);
    expect(packet.taskId).toBe("test-drug/pharmacology");
    const rawText = 'pharmacology:\n  pharmacodynamics: Receptor agonist.\n  binding_sites: []\n  pharmacokinetics: ""\n  metabolites: []\n';
    const value = parseWriterOutput(rawText, "pharmacology");
    const result = await ingestReply({ ...f, packetDigest: packet.packetDigest, output: reply(packet, rawText) });
    const proposal = JSON.parse(readFileSync(result.proposalPath, "utf8"));
    expect(proposal.proposedArticle.pharmacology).toEqual(value);
    expect(proposal.proposedArticle.dosage).toEqual(proposal.baseArticle.dosage);
    expect(proposal.proposedArticle.duration).toEqual(proposal.baseArticle.duration);
    expect(proposal.expectedOwnedHash).toBe(computeSectionCasHash("pharmacology", publicationFieldsForProfile("pharmacology"), proposal.baseArticle));
    expect(proposal.approvedPaths).toEqual(["pharmacology"]);
  });

  it("clarifies history excerpt-only input without altering the registered prompt", async () => {
    const f = fixture({ quotes: [{ slug: "test-drug", section: "history_culture", content: "First synthesized in 1960." }] });
    const packet = await dispatch(f);
    expect(packet.messages[0].content).toContain("No current article YAML is supplied");
    expect(packet.messages[1].content.startsWith("Exact registered history_culture prompt.")).toBe(true);
    expect(JSON.stringify(packet.messages)).not.toContain("Old unrelated claim");
  });
});

describe("strict evidence and command boundaries", () => {
  it("distinguishes headers/no-content markers from short real excerpts without byte thresholds", () => {
    expect(substantiveExcerpt("# Quotes\n## Source: journal\n\n*No relevant information found.*")).toBe("");
    expect(isSourcePoorMarker("*No relevant information found.*")).toBe(true);
    expect(substantiveExcerpt("# Quotes\n> Active.")).toBe("Active.");
    expect(substantiveExcerpt("Active.")).toBe("Active.");
    expect(substantiveExcerpt("No evidence of toxicity was found.")).toBe("No evidence of toxicity was found.");
  });
  it("copies exact text and validates duplicate, reordered, foreign and unknown block IDs", () => {
    const document = sourceDocument(); const blocks = sourceBlocks(document);
    const selected = selectExactBlocks('{"selectedBlockIds":["B000002"]}', blocks, document);
    expect(selected.excerpts[0].text).toBe("Second fact.\n");
    for (const ids of [["B000002", "B000001"], ["B000001", "B000001"], ["B999999"]]) {
      expect(() => selectExactBlocks(JSON.stringify({ selectedBlockIds: ids }), blocks, document)).toThrow();
    }
    expect(() => selectExactBlocks('{"selectedBlockIds":["B000001"]}', [{ ...blocks[0], sourceId: "foreign" }], document)).toThrow("membership");
    expect(() => selectExactBlocks('{"selectedBlockIds":[],"text":"invented"}', blocks, document)).toThrow();
    expect(selectExactBlocks('{"selectedBlockIds":[]}', blocks, document).exactContent).toBe("");
  });
  it.each([
    "summary: Fact.\nlegality: {}", "summary: Fact.\nsummary: Again.", "summary: Fact.[cite:new]",
    "```yaml\nsummary: Fact.\n```", "---\nsummary: Fact.\n---\nsummary: Another.",
    "summary: [Not, a, string]", "summary: According to the provided sources, this is active.",
  ])("rejects malformed or boundary-breaking writer output: %s", (output) => {
    expect(() => parseWriterOutput(output, "summary")).toThrow();
  });
  it("rejects nested unknown keys and validates the canonical section schema", () => {
    expect(() => parseWriterOutput("tolerance:\n  invented: Fact.\n", "tolerance")).toThrow();
    expect(parseWriterOutput('summary: ""', "summary")).toBe("");
    expect(() => parseWriterOutput("legality: {}", "legality")).toThrow("Unowned");
  });
  it("parses only exact command flags and refuses alternate deployments", () => {
    expect(parseCampaignArgs(["next", "--run=runs/section-generation/example", "--limit=3"])).toMatchObject({ command: "next", limit: "3" });
    expect(parseCampaignArgs(["reject", "--run=x", "--task=test-drug/summary", "--reason=Revise wording"]))
      .toMatchObject({ command: "reject", task: "test-drug/summary", reason: "Revise wording" });
    expect(() => parseCampaignArgs(["reject", "--run=x", "--task=test-drug/summary"])).toThrow("--reason");
    for (const args of [["next", "--run=x", "--write"], ["next", "--run=x", "--limit=0"], ["next", "--run=x", "--limit=1", "--limit=2"],
      ["init", "--run=x", "--url=https://other.convex.cloud"], ["init"], ["audit", "--section=legality"]]) expect(() => parseCampaignArgs(args)).toThrow();
    expect(parseCampaignArgs(["audit", `--url=${PRODUCTION_URL}`]).command).toBe("audit");
  });
});
