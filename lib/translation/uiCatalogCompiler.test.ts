import { describe, expect, it } from "vitest";
import { compileUiCatalog, expandUiGlossaryAliases } from "./uiCatalogCompiler";
import { getApprovedUiTranslationsDigest, getUiCatalogCoverage, nextPendingRefresh, readPendingRefresh, type UiCatalogPublication } from "./uiCatalogPublication";
import { resolveUiMessage } from "../../src/i18n/uiMessageDefinitions";
import { translateMessage } from "../../src/i18n/serverMessages";
import { UI_MESSAGE_INVENTORY, getUiMessageInventoryDefinition } from "./uiWorkbenchDefinitions";
import { buildBatchPrompt, resolveLocale } from "../../scripts/translation/locales.mjs";
import { validateSegment } from "../../scripts/translation/validate.mjs";
import catalogDigests from "../../src/i18n/catalogDigests.generated.json";
import publications from "../../src/i18n/catalogPublication.json";
import compiledZhCatalog from "../../content/i18n/messages/zh-Hans.json";

describe("contextual UI catalog", () => {
  it("ships only a digest projection that matches the complete compiled artifact", () => {
    expect(catalogDigests["zh-Hans"]).toBe(publications["zh-Hans"].catalogDigest);
    expect(catalogDigests["zh-Hans"]).toBe(getApprovedUiTranslationsDigest(compiledZhCatalog));
    expect(Object.values(catalogDigests).every((value) => /^[a-f0-9]{64}$/.test(value))).toBe(true);
  });
  it("keeps dose intensity separate from appearance, including fallback", () => {
    const { catalog } = compileUiCatalog({
      locale: "zh-Hans", keys: ["Light"], existing: { Light: "轻度" },
      glossary: new Map([["Light", "轻度"]]), approvedOverrides: {},
    });
    expect(resolveUiMessage(catalog, "appearance.light")).toBe("浅色");
    expect(resolveUiMessage(catalog, "Light")).toBe("轻度");
    expect(resolveUiMessage({ Light: "轻度" }, "appearance.light")).toBe("Light");
    expect(resolveUiMessage(undefined, "appearance.dark")).toBe("Dark");
    expect(translateMessage("en", "appearance.light")).toBe("Light");
    expect(translateMessage("zh-Hans", "appearance.light")).toBe("浅色");
  });

  it("replaces old machine labels with applicable approved glossary renderings", () => {
    const { catalog } = compileUiCatalog({
      locale: "zh-Hans", keys: ["Replications", "Example"],
      existing: { Replications: "复现", "gallery.replications": "复现", Example: "old" },
      glossary: new Map([["Replication", "体验再现"], ["Example", "new"]]), approvedOverrides: {},
    });
    expect(catalog["gallery.replications"]).toBe("体验再现");
    expect(catalog.Replications).toBe("体验再现");
    expect(catalog.Example).toBe("new");
    expect(resolveUiMessage(catalog, "Replications")).toBe("体验再现");
  });

  it("preserves approved human labels across glossary and seed changes", () => {
    const { catalog } = compileUiCatalog({
      locale: "zh-Hans", keys: ["Replications"],
      existing: { "gallery.replications": "old machine" },
      glossary: new Map([["Replications", "new glossary"]]),
      approvedOverrides: { "gallery.replications": "human wording" },
      seed: new Map([["gallery.replications", "seed"]]),
    });
    expect(catalog["gallery.replications"]).toBe("human wording");
    expect(catalog.Replications).toBe("human wording");
  });

  it("reports mismatched approvals and never calls an offline compile deployed", () => {
    const catalog = { "appearance.light": "浅色" };
    const approved = { "appearance.light": "updated" };
    const coverage = getUiCatalogCoverage("zh-Hans", catalog, approved, {
      compiledAt: "2026-09-21", catalogDigest: getApprovedUiTranslationsDigest(catalog),
      approvedUiDigest: null, approvedUiSource: "offline-unverified", sourceInventoryDigest: "source", exactLabels: {},
    });
    expect(coverage.approvalMismatches).toEqual(["appearance.light"]);
    expect(coverage.approvedSnapshotCurrent).toBe(false);
    expect(coverage.liveVerified).toBe(false);
    expect(coverage.missingIds).toContain("gallery.replications");
  });

  it("hashes deterministically and detects a changed compiled artifact", () => {
    expect(getApprovedUiTranslationsDigest({ b: "2", a: "1" })).toBe(getApprovedUiTranslationsDigest({ a: "1", b: "2" }));
    const approved = { "appearance.light": "浅色" };
    const metadata = {
      compiledAt: "2026-09-21", catalogDigest: getApprovedUiTranslationsDigest(approved),
      approvedUiDigest: getApprovedUiTranslationsDigest(approved), approvedUiSource: "store" as const,
      sourceInventoryDigest: "source", exactLabels: {},
    };
    expect(getUiCatalogCoverage("zh-Hans", approved, approved, metadata).approvedSnapshotCurrent).toBe(true);
    expect(getUiCatalogCoverage("zh-Hans", { ...approved, extra: "changed" }, approved, metadata).approvedSnapshotCurrent).toBe(false);
  });

  it("includes ordinary UI copy in editable coverage and publishes its human override", () => {
    const entry = Object.entries(UI_MESSAGE_INVENTORY).find(([, definition]) => definition.catalogKey === "Light");
    expect(entry).toBeDefined();
    expect(entry![0]).toMatch(/^legacy\.[a-f0-9]{64}$/);
    expect(getUiMessageInventoryDefinition(entry![0])?.context).toContain("Dose intensity");
    const { catalog } = compileUiCatalog({ locale: "zh-Hans", keys: ["Light"], existing: { Light: "old" }, glossary: new Map(), approvedOverrides: { Light: "human dose label" } });
    expect(catalog.Light).toBe("human dose label");
    const coverage = getUiCatalogCoverage("zh-Hans", catalog, {}, undefined, UI_MESSAGE_INVENTORY);
    expect(coverage.total).toBeGreaterThan(1000);
    expect(coverage.missingIds).not.toContain(entry![0]);
  });

  it("gives model requests usage context separately from translated source", () => {
    const prompt = buildBatchPrompt(resolveLocale("zh-Hans"), [{ id: "1", source: "Light", contextClass: "prose", context: "Appearance setting, not dose intensity" }]);
    expect(prompt).toContain('"1": "Light"');
    expect(prompt).toContain("Appearance setting, not dose intensity");
    expect(prompt).toContain("do not translate this metadata");
  });

  it("queues existing homepage prose for targeted glossary regeneration and preserves its offline fallback", () => {
    const source = "Explore replications of subjective experiences.";
    const existing = { [source]: "探索主观体验的复现。" };
    const result = compileUiCatalog({ locale: "zh-Hans", keys: [source], existing, glossary: new Map([["Replication", "体验再现"]]), approvedOverrides: {} });
    expect(result.pending).toContain(source);
    expect(result.pendingRefresh).toEqual([{ catalogKey: source, term: "Replication", expectedTarget: "体验再现" }]);
    expect(result.catalog[source]).toBe(existing[source]);
    expect(result.glossaryMisses).toEqual([{ catalogKey: source, term: "Replication", expectedTarget: "体验再现", humanApproved: false }]);
  });

  it.each(["Alkaloid (tropane)", "ALKALOID (TROPANE)"])("keeps whole approved phrase %s authoritative over nested terminology", (source) => {
    const result = compileUiCatalog({
      locale: "zh-Hans", keys: [source], existing: { [source]: "old machine" },
      glossary: new Map([["Alkaloid (tropane)", "莨菪类生物碱"], ["tropane", "托烷"]]),
      approvedOverrides: {},
    });
    expect(result.catalog[source]).toBe("莨菪类生物碱");
    expect(result.pending).not.toContain(source);
    expect(result.pendingRefresh).not.toContain(source);
    expect(result.glossaryMisses).toContainEqual({ catalogKey: source, term: "tropane", expectedTarget: "托烷", humanApproved: false });
  });

  it("never regenerates approved prose even when it needs contextual glossary review", () => {
    const source = "Explore replications of subjective experiences.";
    const approved = { [source]: "经过人工审核的中文描述。" };
    const result = compileUiCatalog({ locale: "zh-Hans", keys: [source], existing: { [source]: "old" }, glossary: new Map([["Replications", "体验再现"]]), approvedOverrides: approved });
    expect(result.catalog[source]).toBe(approved[source]);
    expect(result.pending).not.toContain(source);
    expect(result.pendingRefresh).toEqual([]);
    expect(result.glossaryMisses[0].humanApproved).toBe(true);
  });

  it("offline audit terminology cannot overwrite an existing contextual correction", () => {
    const result = compileUiCatalog({ locale: "zh-Hans", keys: [], existing: { "gallery.replications": "previous human correction" }, glossary: new Map(), auditGlossary: new Map([["Replications", "体验再现"]]), approvedOverrides: {} });
    expect(result.catalog["gallery.replications"]).toBe("previous human correction");
  });

  it("passes declared singular/plural equivalents to the actual model prompt and validator", () => {
    const source = "Explore replications of subjective experiences.";
    const glossary = Object.fromEntries(expandUiGlossaryAliases(new Map([["replication", "体验再现"], ["Light", "轻度"]])));
    const locale = resolveLocale("zh-Hans");
    const prompt = buildBatchPrompt(locale, [{ id: "1", source, contextClass: "prose" }], { glossary });
    expect(prompt).toContain("Replications -> 体验再现");
    expect(validateSegment({ source, target: "探索主观体验的复现。", locale, glossary }).defects).toContain("GLOSSARY_MISS");
    expect(validateSegment({ source, target: "探索主观体验的体验再现。", locale, glossary }).defects).not.toContain("GLOSSARY_MISS");
    expect(glossary["appearance.light"]).toBeUndefined();
    expect(glossary.Light).toBe("轻度");
  });
});

describe("glossary refresh of longer UI strings", () => {
  const glossary = new Map([["Replication", "体验再现"]]);
  const back = "Back to replications";
  const tutorials = "Tutorials and resources for replicating specific subjective effects, preserved from the Effect Index archive.";

  it("queues an existing label that renders an approved term the old way, naming the term", () => {
    const result = compileUiCatalog({ locale: "zh-Hans", keys: [back], existing: { [back]: "返回复现" }, glossary, approvedOverrides: {} });
    expect(result.pendingRefresh).toContainEqual({ catalogKey: back, term: "Replication", expectedTarget: "体验再现" });
    expect(result.pending).toContain(back);
    // Until a refresh runs, readers keep the existing wording rather than a blind substitution.
    expect(result.catalog[back]).toBe("返回复现");
  });

  it("matches inflected mentions in longer prose", () => {
    const result = compileUiCatalog({ locale: "zh-Hans", keys: [tutorials], existing: { [tutorials]: "用于复现特定主观效应的教程和资源，保存自 Effect Index 存档。" }, glossary, approvedOverrides: {} });
    expect(result.pendingRefresh).toEqual([{ catalogKey: tutorials, term: "Replication", expectedTarget: "体验再现" }]);
  });

  it("never queues a human-approved override that keeps the old rendering on purpose", () => {
    const result = compileUiCatalog({ locale: "zh-Hans", keys: [back], existing: { [back]: "old" }, glossary, approvedOverrides: { [back]: "返回复现" } });
    expect(result.catalog[back]).toBe("返回复现");
    expect(result.pendingRefresh.map((entry) => entry.catalogKey)).not.toContain(back);
    expect(result.pending).not.toContain(back);
  });

  const publication = (overrides: Partial<UiCatalogPublication>): UiCatalogPublication => ({
    compiledAt: "2026-09-21", catalogDigest: "c", approvedUiDigest: null, approvedUiSource: "offline-unverified", sourceInventoryDigest: "s", exactLabels: {}, ...overrides,
  });

  it("reads the checked-in shape, taking each term from the QA misses", () => {
    const record = publication({
      pendingRefresh: [back, "Unexplained key"],
      qaGlossaryMisses: [{ catalogKey: back, term: "Replications", expectedTarget: "体验再现", humanApproved: false }],
    });
    const pending = readPendingRefresh(record);
    expect(pending.refreshed).toBe(false);
    expect(pending.entries.get(back)).toEqual({ catalogKey: back, term: "Replications", expectedTarget: "体验再现" });
    expect(pending.entries.get("Unexplained key")).toEqual({ catalogKey: "Unexplained key", term: null, expectedTarget: null });
    expect(readPendingRefresh(undefined)).toEqual({ refreshed: false, entries: new Map() });
    expect(readPendingRefresh(publication({ approvedUiSource: "store", approvedUiDigest: "a", pendingRefresh: [] })).refreshed).toBe(true);
  });

  it("keeps the waiting list through an offline compile and marks it not refreshed", () => {
    const previous = publication({ approvedUiSource: "store", pendingRefreshStatus: "refreshed", pendingRefresh: [{ catalogKey: back, term: "Replication", expectedTarget: "体验再现" }, { catalogKey: "Gone", term: "Replication", expectedTarget: "体验再现" }] });
    const catalog = { [back]: "返回复现", [tutorials]: "用于复现特定主观效应的教程和资源，保存自 Effect Index 存档。" };
    const computed = [{ catalogKey: tutorials, term: "Replications", expectedTarget: "体验再现" }];
    const offline = nextPendingRefresh({ offline: true, previous, computed, catalog });
    expect(offline.pendingRefreshStatus).toBe("not-refreshed");
    expect(offline.pendingRefresh).toEqual([
      { catalogKey: back, term: "Replication", expectedTarget: "体验再现" },
      { catalogKey: tutorials, term: "Replications", expectedTarget: "体验再现" },
    ]);
    // An offline compile that finds its target already carries the term drops the entry.
    expect(nextPendingRefresh({ offline: true, previous, computed: [], catalog: { [back]: "返回体验再现" } }).pendingRefresh).toEqual([]);
    expect(nextPendingRefresh({ offline: false, previous, computed, catalog })).toEqual({ pendingRefresh: [], pendingRefreshStatus: "refreshed" });
  });
});
