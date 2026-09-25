import { describe, expect, it } from "vitest";

import { buildTagRegistry, type TagRegistryInput } from "@/utils/data/tagRegistry";
import { applyDraft } from "./tagDraftProjection";

const row = (title: string, index: string[], slug?: string): TagRegistryInput & { slug?: string } => ({
  ...(slug ? { slug } : {}),
  title,
  identification: { common_name: title } as TagRegistryInput["identification"],
  index_categories: index,
  classification: { chemical_class: [], psychoactive_class: [] } as unknown as TagRegistryInput["classification"],
  pharmacology: { binding_sites: [] },
});

const indexTags = (rows: TagRegistryInput[]) =>
  buildTagRegistry(rows).byField.index_categories.map((usage) => `${usage.tag}:${usage.count}`);

describe("applyDraft", () => {
  const lsd = row("LSD", ["Classic", "Psychedelic"]);
  const mdma = row("MDMA", ["Empathogen"]);
  const server = [row("LSD", ["Classic", "Psychedelic"], "lsd"), row("MDMA", ["Empathogen"], "mdma"), row("DMT", ["Classic"], "dmt")];

  it("is the server tags while the draft holds no tag change", () => {
    expect(applyDraft(server, { articles: [lsd, mdma], baseline: [lsd, mdma] })).toEqual(server);
  });

  it("layers a changed draft row over its server row, and keeps rows the draft never loaded", () => {
    const renamed = row("LSD", ["Classic Rock", "Psychedelic"]);
    const projected = applyDraft(server, { articles: [renamed, mdma], baseline: [lsd, mdma] });

    expect(indexTags(projected)).toEqual(expect.arrayContaining(["Classic Rock:1", "Classic:1", "Empathogen:1", "Psychedelic:1"]));
    expect(projected.map((entry) => entry.title)).toEqual(["LSD", "MDMA", "DMT"]);
  });

  it("keeps the server row when a draft edit changed something other than tags", () => {
    const retitled = { ...lsd, summary: "Edited prose." };
    expect(applyDraft(server, { articles: [retitled, mdma], baseline: [lsd, mdma] })).toEqual(server);
  });

  it("adds an article created in the draft and drops one removed from it", () => {
    const added = row("Ketamine", ["Dissociative"]);
    const projected = applyDraft(server, { articles: [lsd, added], baseline: [lsd, mdma] });

    expect(projected.map((entry) => entry.title)).toEqual(["LSD", "DMT", "Ketamine"]);
  });
});
