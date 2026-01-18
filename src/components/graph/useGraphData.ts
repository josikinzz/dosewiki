import { useMemo, useState, useCallback } from "react";
import { useLibrary } from "../../data/ArticlesProvider";
import { slugify } from "../../utils/slug";
import type { GraphNode, GraphLink, GraphData, HierarchyData, SubstanceData } from "./graphTypes";

const ROOT_ID = "root";

export function useGraphData() {
  const { articles } = useLibrary();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([ROOT_ID]));

  // Build the hierarchy data from articles
  const hierarchyData = useMemo<HierarchyData>(() => {
    const psychoactiveClasses = new Map<string, Set<string>>();
    const chemicalClasses = new Map<string, Set<string>>();
    const substances = new Map<string, SubstanceData>();

    for (const article of articles) {
      // Skip hidden articles
      if (article.index_categories?.includes("Hidden")) continue;

      const slug = slugify(article.title);
      const pClasses = article.classification?.psychoactive_class ?? [];
      const cClasses = article.classification?.chemical_class ?? [];
      const effectCount =
        (article.subjective_effects?.physical?.length ?? 0) +
        (article.subjective_effects?.cognitive?.length ?? 0) +
        (article.subjective_effects?.sensory?.length ?? 0);

      // Store substance data
      substances.set(slug, {
        title: article.title,
        slug,
        psychoactiveClasses: pClasses,
        chemicalClasses: cClasses,
        effectCount,
      });

      // Build psychoactive -> chemical mappings
      for (const pClass of pClasses) {
        if (!psychoactiveClasses.has(pClass)) {
          psychoactiveClasses.set(pClass, new Set());
        }
        for (const cClass of cClasses) {
          psychoactiveClasses.get(pClass)!.add(cClass);
        }
      }

      // Build chemical -> substance mappings
      for (const cClass of cClasses) {
        if (!chemicalClasses.has(cClass)) {
          chemicalClasses.set(cClass, new Set());
        }
        chemicalClasses.get(cClass)!.add(slug);
      }
    }

    return { psychoactiveClasses, chemicalClasses, substances };
  }, [articles]);

  // Build visible graph data based on expanded nodes
  const graphData = useMemo<GraphData>(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeIds = new Set<string>();

    // Always add root node
    nodes.push({
      id: ROOT_ID,
      type: "root",
      label: "Psychoactive Substances",
      parentIds: [],
      childCount: hierarchyData.psychoactiveClasses.size,
      expanded: expandedNodes.has(ROOT_ID),
    });
    nodeIds.add(ROOT_ID);

    // Add psychoactive class nodes if root is expanded
    if (expandedNodes.has(ROOT_ID)) {
      for (const [pClass, chemClasses] of hierarchyData.psychoactiveClasses) {
        const pClassId = `p:${slugify(pClass)}`;
        nodes.push({
          id: pClassId,
          type: "psychoactive",
          label: pClass,
          parentIds: [ROOT_ID],
          childCount: chemClasses.size,
          expanded: expandedNodes.has(pClassId),
        });
        nodeIds.add(pClassId);
        links.push({
          source: ROOT_ID,
          target: pClassId,
          type: "root-psychoactive",
        });

        // Add chemical class nodes if this psychoactive class is expanded
        if (expandedNodes.has(pClassId)) {
          for (const cClass of chemClasses) {
            const cClassId = `c:${slugify(cClass)}`;

            // Only add chemical class node once
            if (!nodeIds.has(cClassId)) {
              const substanceCount = hierarchyData.chemicalClasses.get(cClass)?.size ?? 0;
              nodes.push({
                id: cClassId,
                type: "chemical",
                label: cClass,
                parentIds: [],
                childCount: substanceCount,
                expanded: expandedNodes.has(cClassId),
              });
              nodeIds.add(cClassId);
            }

            // Find the node and add parent reference
            const cClassNode = nodes.find((n) => n.id === cClassId);
            if (cClassNode && !cClassNode.parentIds.includes(pClassId)) {
              cClassNode.parentIds.push(pClassId);
            }

            // Add link from psychoactive to chemical
            links.push({
              source: pClassId,
              target: cClassId,
              type: "psychoactive-chemical",
            });

            // Add substance nodes if this chemical class is expanded
            if (expandedNodes.has(cClassId)) {
              const substanceSlugs = hierarchyData.chemicalClasses.get(cClass);
              if (substanceSlugs) {
                for (const substanceSlug of substanceSlugs) {
                  const substanceId = `s:${substanceSlug}`;
                  const substanceData = hierarchyData.substances.get(substanceSlug);

                  if (!substanceData) continue;

                  // Only add substance node once
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

                  // Find the node and add parent reference
                  const substanceNode = nodes.find((n) => n.id === substanceId);
                  if (substanceNode && !substanceNode.parentIds.includes(cClassId)) {
                    substanceNode.parentIds.push(cClassId);
                  }

                  // Add link from chemical to substance
                  links.push({
                    source: cClassId,
                    target: substanceId,
                    type: "chemical-substance",
                  });
                }
              }
            }
          }
        }
      }
    }

    return { nodes, links };
  }, [hierarchyData, expandedNodes]);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set([ROOT_ID]));
  }, []);

  const expandToSubstance = useCallback((substanceSlug: string) => {
    const substance = hierarchyData.substances.get(substanceSlug);
    if (!substance) return;

    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.add(ROOT_ID);

      // Expand all psychoactive classes this substance belongs to
      for (const pClass of substance.psychoactiveClasses) {
        next.add(`p:${slugify(pClass)}`);
      }

      // Expand all chemical classes this substance belongs to
      for (const cClass of substance.chemicalClasses) {
        next.add(`c:${slugify(cClass)}`);
      }

      return next;
    });
  }, [hierarchyData]);

  return {
    graphData,
    hierarchyData,
    expandedNodes,
    toggleNode,
    collapseAll,
    expandToSubstance,
    stats: {
      psychoactiveClassCount: hierarchyData.psychoactiveClasses.size,
      chemicalClassCount: hierarchyData.chemicalClasses.size,
      substanceCount: hierarchyData.substances.size,
    },
  };
}
