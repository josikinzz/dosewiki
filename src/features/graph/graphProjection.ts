import type { SubstanceRecord } from "@/data/builders/contentBuilder";
import { slugify } from "@/utils/slug";
import type {
  GraphData,
  GraphLink,
  GraphNode,
  GraphProjection,
  GraphSearchTarget,
  GraphStats,
  HierarchyData,
  SubstanceData,
} from "./graphTypes";

export const GRAPH_ROOT_ID = "root";
const ROOT_LABEL = "Psychoactive Substances";

const normalizeClassList = (values: readonly string[] | undefined): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  values?.forEach((value) => {
    const label = value.trim();
    if (!label || seen.has(label)) {
      return;
    }

    seen.add(label);
    result.push(label);
  });

  return result;
};

export function buildGraphHierarchy(records: readonly SubstanceRecord[]): HierarchyData {
  const psychoactiveClasses = new Map<string, Set<string>>();
  const chemicalClasses = new Map<string, Set<string>>();
  const substances = new Map<string, SubstanceData>();

  records.forEach((record) => {
    if (record.isHidden) {
      return;
    }

    const psychoactiveClassList = normalizeClassList(record.psychoactiveClasses);
    const chemicalClassList = normalizeClassList(record.chemicalClasses);

    substances.set(record.slug, {
      title: record.name,
      slug: record.slug,
      psychoactiveClasses: psychoactiveClassList,
      chemicalClasses: chemicalClassList,
      effectCount: record.content.subjectiveEffects.length,
    });

    psychoactiveClassList.forEach((psychoactiveClass) => {
      if (!psychoactiveClasses.has(psychoactiveClass)) {
        psychoactiveClasses.set(psychoactiveClass, new Set());
      }

      chemicalClassList.forEach((chemicalClass) => {
        psychoactiveClasses.get(psychoactiveClass)?.add(chemicalClass);
      });
    });

    chemicalClassList.forEach((chemicalClass) => {
      if (!chemicalClasses.has(chemicalClass)) {
        chemicalClasses.set(chemicalClass, new Set());
      }

      chemicalClasses.get(chemicalClass)?.add(record.slug);
    });
  });

  return { psychoactiveClasses, chemicalClasses, substances };
}

export function buildVisibleGraphData(
  hierarchyData: HierarchyData,
  expandedNodes: ReadonlySet<string>,
): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeIds = new Set<string>();

  nodes.push({
    id: GRAPH_ROOT_ID,
    type: "root",
    label: ROOT_LABEL,
    parentIds: [],
    childCount: hierarchyData.psychoactiveClasses.size,
    expanded: expandedNodes.has(GRAPH_ROOT_ID),
  });
  nodeIds.add(GRAPH_ROOT_ID);

  if (!expandedNodes.has(GRAPH_ROOT_ID)) {
    return { nodes, links };
  }

  for (const [psychoactiveClass, chemicalClassSet] of hierarchyData.psychoactiveClasses) {
    const psychoactiveClassId = `p:${slugify(psychoactiveClass)}`;

    nodes.push({
      id: psychoactiveClassId,
      type: "psychoactive",
      label: psychoactiveClass,
      parentIds: [GRAPH_ROOT_ID],
      childCount: chemicalClassSet.size,
      expanded: expandedNodes.has(psychoactiveClassId),
    });
    nodeIds.add(psychoactiveClassId);
    links.push({
      source: GRAPH_ROOT_ID,
      target: psychoactiveClassId,
      type: "root-psychoactive",
    });

    if (!expandedNodes.has(psychoactiveClassId)) {
      continue;
    }

    for (const chemicalClass of chemicalClassSet) {
      const chemicalClassId = `c:${slugify(chemicalClass)}`;

      if (!nodeIds.has(chemicalClassId)) {
        nodes.push({
          id: chemicalClassId,
          type: "chemical",
          label: chemicalClass,
          parentIds: [],
          childCount: hierarchyData.chemicalClasses.get(chemicalClass)?.size ?? 0,
          expanded: expandedNodes.has(chemicalClassId),
        });
        nodeIds.add(chemicalClassId);
      }

      const chemicalClassNode = nodes.find((node) => node.id === chemicalClassId);
      if (chemicalClassNode && !chemicalClassNode.parentIds.includes(psychoactiveClassId)) {
        chemicalClassNode.parentIds.push(psychoactiveClassId);
      }

      links.push({
        source: psychoactiveClassId,
        target: chemicalClassId,
        type: "psychoactive-chemical",
      });

      if (!expandedNodes.has(chemicalClassId)) {
        continue;
      }

      const substanceSlugs = hierarchyData.chemicalClasses.get(chemicalClass);
      if (!substanceSlugs) {
        continue;
      }

      for (const substanceSlug of substanceSlugs) {
        const substanceId = `s:${substanceSlug}`;
        const substanceData = hierarchyData.substances.get(substanceSlug);
        if (!substanceData) {
          continue;
        }

        if (!nodeIds.has(substanceId)) {
          nodes.push({
            id: substanceId,
            type: "substance",
            label: substanceData.title,
            slug: substanceSlug,
            parentIds: [],
            childCount: substanceData.effectCount,
            expanded: false,
          });
          nodeIds.add(substanceId);
        }

        const substanceNode = nodes.find((node) => node.id === substanceId);
        if (substanceNode && !substanceNode.parentIds.includes(chemicalClassId)) {
          substanceNode.parentIds.push(chemicalClassId);
        }

        links.push({
          source: chemicalClassId,
          target: substanceId,
          type: "chemical-substance",
        });
      }
    }
  }

  return { nodes, links };
}

export function buildGraphSearchTargets(hierarchyData: HierarchyData): GraphSearchTarget[] {
  return Array.from(hierarchyData.substances.values())
    .map((substance) => ({
      slug: substance.slug,
      title: substance.title,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function buildGraphStats(hierarchyData: HierarchyData): GraphStats {
  return {
    psychoactiveClassCount: hierarchyData.psychoactiveClasses.size,
    chemicalClassCount: hierarchyData.chemicalClasses.size,
    substanceCount: hierarchyData.substances.size,
  };
}

export function projectGraphData(
  records: readonly SubstanceRecord[],
  expandedNodes: ReadonlySet<string>,
): GraphProjection {
  const hierarchyData = buildGraphHierarchy(records);

  return {
    graphData: buildVisibleGraphData(hierarchyData, expandedNodes),
    hierarchyData,
    searchTargets: buildGraphSearchTargets(hierarchyData),
    stats: buildGraphStats(hierarchyData),
  };
}

export function getExpandedNodeIdsForSubstance(
  hierarchyData: HierarchyData,
  substanceSlug: string,
): string[] {
  const substance = hierarchyData.substances.get(substanceSlug);
  if (!substance) {
    return [];
  }

  return [
    GRAPH_ROOT_ID,
    ...substance.psychoactiveClasses.map((psychoactiveClass) => `p:${slugify(psychoactiveClass)}`),
    ...substance.chemicalClasses.map((chemicalClass) => `c:${slugify(chemicalClass)}`),
  ];
}
