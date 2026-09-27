import { describe, expect, it } from "vitest";

import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { applyTagMutation, buildTagRegistry, getTagUsage } from "@/utils/data/tagRegistry";

import { checkRename, describeTagChange, matchesInOtherFields, similarTags, tagChanges } from "./tagEditorModel";

function article(id: number, title: string, categories: string[], chemical: string[] = []): SubstanceArticle {
  const row = createEmptyArticle() as SubstanceArticle & { slug?: string };
  row.id = id;
  row.title = title;
  row.slug = title.toLowerCase();
  row.identification.common_name = title;
  row.index_categories = categories;
  row.classification.chemical_class = chemical;
  return row;
}

const corpus = [
  article(1, "Alprazolam", ["Benzodiazepines", "Depressants"], ["Benzodiazepine"]),
  article(2, "Diazepam", ["Benzodiazepines", "Depressants"], ["Benzodiazepines"]),
  article(3, "Caffeine", ["Stimulants"], ["Xanthine"]),
  article(4, "Cocaine", ["Stimulant"], ["Tropane"]),
];

describe("checkRename", () => {
  const registry = buildTagRegistry(corpus);
  const benzos = getTagUsage(registry, "chemical_class", "benzodiazepines")!;

  it("blocks an empty or unchanged label and names a case-only change", () => {
    expect(checkRename(registry, benzos, "  ").kind).toBe("empty");
    expect(checkRename(registry, benzos, "Benzodiazepines").kind).toBe("same");
    expect(checkRename(registry, benzos, "benzodiazepines")).toEqual({ kind: "case", label: "benzodiazepines" });
  });

  it("says a rename onto an existing label merges, counting shared articles once", () => {
    const check = checkRename(registry, benzos, "benzodiazepine ");
    expect(check.kind).toBe("merge");
    if (check.kind !== "merge") return;
    expect(check.into.tag).toBe("Benzodiazepine");
    expect(check.total).toBe(2);
  });

  it("reads a new label as a plain rename", () => {
    expect(checkRename(registry, benzos, "Benzos")).toEqual({ kind: "rename", label: "Benzos" });
  });
});

describe("similarTags", () => {
  it("finds the same tag written in the singular or plural", () => {
    const registry = buildTagRegistry(corpus);
    const stimulants = getTagUsage(registry, "index_categories", "stimulants")!;
    expect(similarTags(registry, stimulants).map((usage) => usage.tag)).toEqual(["Stimulant"]);
    const xanthine = getTagUsage(registry, "chemical_class", "xanthine")!;
    expect(similarTags(registry, xanthine)).toEqual([]);
  });
});

describe("tagChanges", () => {
  const server = buildTagRegistry(corpus);

  it("reads a relabel of the same articles as a rename", () => {
    const renamed = applyTagMutation(corpus, { type: "rename", field: "index_categories", fromTag: "Benzodiazepines", toTag: "Benzos" });
    const changes = tagChanges(server, buildTagRegistry(renamed.articles));
    expect(changes).toEqual([
      expect.objectContaining({ field: "index_categories", tag: "Benzos", kind: "renamed", from: ["Benzodiazepines"], after: 2 }),
    ]);
    expect(describeTagChange(changes[0])).toBe("renamed from “Benzodiazepines”, on 2 articles");
  });

  it("reads a rename onto an existing label as a merge", () => {
    const merged = applyTagMutation(corpus, { type: "rename", field: "index_categories", fromTag: "Stimulant", toTag: "Stimulants" });
    const changes = tagChanges(server, buildTagRegistry(merged.articles));
    expect(changes).toEqual([
      expect.objectContaining({ tag: "Stimulants", kind: "merged", from: ["Stimulant"], before: 1, after: 2 }),
    ]);
  });

  it("lists a removal as gone and nothing when nothing changed", () => {
    expect(tagChanges(server, buildTagRegistry(corpus))).toEqual([]);
    const deleted = applyTagMutation(corpus, { type: "delete", field: "chemical_class", tag: "Xanthine" });
    const changes = tagChanges(server, buildTagRegistry(deleted.articles));
    expect(changes).toEqual([expect.objectContaining({ tag: "Xanthine", kind: "gone", before: 1, after: 0 })]);
    expect(describeTagChange(changes[0])).toBe("removed, was on 1 article");
  });
});

describe("matchesInOtherFields", () => {
  it("points a search with no match here at the fields that have one", () => {
    const registry = buildTagRegistry(corpus);
    expect(matchesInOtherFields(registry, "index_categories", "xanth")).toEqual([{ field: "chemical_class", count: 1 }]);
    expect(matchesInOtherFields(registry, "index_categories", " ")).toEqual([]);
  });
});
