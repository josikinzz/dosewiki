import { describe, expect, it } from "vitest";
import type { SubstanceRecord } from "@/data/builders/contentBuilder";
import {
  buildGraphHierarchy,
  buildVisibleGraphData,
  getExpandedNodeIdsForSubstance,
  GRAPH_ROOT_ID,
  projectGraphData,
} from "./graphProjection";

const createRecord = (
  overrides: Partial<SubstanceRecord> & Pick<SubstanceRecord, "name" | "slug">,
): SubstanceRecord => {
  const chemicalClasses = overrides.chemicalClasses ?? [];
  const psychoactiveClasses = overrides.psychoactiveClasses ?? [];

  return {
    id: null,
    aliases: [],
    categories: [...psychoactiveClasses, ...chemicalClasses],
    indexCategories: [],
    priority: "normal",
    isHidden: false,
    isLowPriority: false,
    ...overrides,
    chemicalClasses,
    psychoactiveClasses,
    content: {
      name: overrides.name,
      aliases: [],
      nameVariants: [],
      moleculePlaceholder: "",
      heroBadges: [],
      categoryKeys: [],
      categories: [...psychoactiveClasses, ...chemicalClasses],
      dosageUnitsNote: undefined,
      routes: {},
      routeOrder: [],
      addictionSummary: "",
      subjectiveEffects: [],
      interactions: [],
      tolerance: [],
      reagentTesting: {},
      notes: "",
      sourceCitations: [],
      citations: [],
      infoSections: [],
      subtitle: "",
      ...overrides.content,
    },
  };
};

const nodeIds = (records: ReturnType<typeof buildVisibleGraphData>) =>
  records.nodes.map((node) => node.id);

const linkIds = (records: ReturnType<typeof buildVisibleGraphData>) =>
  records.links.map((link) => `${link.source}->${link.target}`);

describe("graph projection", () => {
  it("builds hierarchy data from normalized records and keeps visibility policy local", () => {
    const hierarchy = buildGraphHierarchy([
      createRecord({
        name: "LSD",
        slug: "lsd",
        psychoactiveClasses: ["Psychedelic", "Psychedelic"],
        chemicalClasses: ["Lysergamide", "Ergoline"],
        content: { subjectiveEffects: ["visuals", "thought loops"] } as SubstanceRecord["content"],
      }),
      createRecord({
        name: "1P-LSD",
        slug: "1p-lsd",
        psychoactiveClasses: ["Psychedelic"],
        chemicalClasses: ["Lysergamide"],
        priority: "low",
        isLowPriority: true,
      }),
      createRecord({
        name: "Hidden sample",
        slug: "hidden-sample",
        psychoactiveClasses: ["Psychedelic"],
        chemicalClasses: ["Tryptamine"],
        isHidden: true,
        indexCategories: ["Hidden"],
      }),
      createRecord({
        name: "Unclassified",
        slug: "unclassified",
      }),
    ]);

    expect(Array.from(hierarchy.substances.keys())).toEqual(["lsd", "1p-lsd", "unclassified"]);
    expect(Array.from(hierarchy.psychoactiveClasses.keys())).toEqual(["Psychedelic"]);
    expect(Array.from(hierarchy.psychoactiveClasses.get("Psychedelic") ?? [])).toEqual([
      "Lysergamide",
      "Ergoline",
    ]);
    expect(Array.from(hierarchy.chemicalClasses.get("Lysergamide") ?? [])).toEqual([
      "lsd",
      "1p-lsd",
    ]);
    expect(hierarchy.substances.get("lsd")?.effectCount).toBe(2);
  });

  it("projects visible nodes and links from expansion state", () => {
    const records = [
      createRecord({
        name: "LSD",
        slug: "lsd",
        psychoactiveClasses: ["Psychedelic"],
        chemicalClasses: ["Lysergamide"],
      }),
      createRecord({
        name: "MDMA",
        slug: "mdma",
        psychoactiveClasses: ["Entactogen"],
        chemicalClasses: ["Phenethylamine"],
      }),
    ];

    const collapsed = projectGraphData(records, new Set([GRAPH_ROOT_ID]));
    expect(nodeIds(collapsed.graphData)).toEqual([
      "root",
      "p:psychedelic",
      "p:entactogen",
    ]);
    expect(linkIds(collapsed.graphData)).toEqual([
      "root->p:psychedelic",
      "root->p:entactogen",
    ]);

    const expanded = projectGraphData(
      records,
      new Set([GRAPH_ROOT_ID, "p:psychedelic", "c:lysergamide"]),
    );
    expect(nodeIds(expanded.graphData)).toEqual([
      "root",
      "p:psychedelic",
      "c:lysergamide",
      "s:lsd",
      "p:entactogen",
    ]);
    expect(linkIds(expanded.graphData)).toContain("p:psychedelic->c:lysergamide");
    expect(linkIds(expanded.graphData)).toContain("c:lysergamide->s:lsd");
  });

  it("deduplicates shared class and substance nodes while retaining all parent links", () => {
    const projection = projectGraphData(
      [
        createRecord({
          name: "Shared substance",
          slug: "shared-substance",
          psychoactiveClasses: ["Psychedelic", "Dissociative"],
          chemicalClasses: ["Arylcyclohexylamine"],
        }),
      ],
      new Set([
        GRAPH_ROOT_ID,
        "p:psychedelic",
        "p:dissociative",
        "c:arylcyclohexylamine",
      ]),
    );

    expect(nodeIds(projection.graphData).filter((id) => id === "c:arylcyclohexylamine")).toHaveLength(1);
    expect(nodeIds(projection.graphData).filter((id) => id === "s:shared-substance")).toHaveLength(1);
    expect(linkIds(projection.graphData)).toEqual([
      "root->p:psychedelic",
      "p:psychedelic->c:arylcyclohexylamine",
      "c:arylcyclohexylamine->s:shared-substance",
      "root->p:dissociative",
      "p:dissociative->c:arylcyclohexylamine",
      "c:arylcyclohexylamine->s:shared-substance",
    ]);
  });

  it("returns graph search targets, stats, and expansion targets from the same projection seam", () => {
    const projection = projectGraphData(
      [
        createRecord({
          name: "MDMA",
          slug: "mdma",
          psychoactiveClasses: ["Entactogen"],
          chemicalClasses: ["Phenethylamine"],
        }),
        createRecord({
          name: "LSD",
          slug: "lsd",
          psychoactiveClasses: ["Psychedelic"],
          chemicalClasses: ["Lysergamide"],
        }),
      ],
      new Set([GRAPH_ROOT_ID]),
    );

    expect(projection.searchTargets).toEqual([
      { slug: "lsd", title: "LSD" },
      { slug: "mdma", title: "MDMA" },
    ]);
    expect(projection.stats).toEqual({
      psychoactiveClassCount: 2,
      chemicalClassCount: 2,
      substanceCount: 2,
    });
    expect(getExpandedNodeIdsForSubstance(projection.hierarchyData, "lsd")).toEqual([
      "root",
      "p:psychedelic",
      "c:lysergamide",
    ]);
    expect(getExpandedNodeIdsForSubstance(projection.hierarchyData, "unknown")).toEqual([]);
  });
});
