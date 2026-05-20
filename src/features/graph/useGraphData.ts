import { useCallback, useMemo, useState } from "react";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import {
  getExpandedNodeIdsForSubstance,
  GRAPH_ROOT_ID,
  projectGraphData,
} from "./graphProjection";

export function useGraphData() {
  const { allSubstanceRecords } = useLibrary();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([GRAPH_ROOT_ID]));
  const projection = useMemo(
    () => projectGraphData(allSubstanceRecords, expandedNodes),
    [allSubstanceRecords, expandedNodes],
  );

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
    setExpandedNodes(new Set([GRAPH_ROOT_ID]));
  }, []);

  const expandToSubstance = useCallback((substanceSlug: string) => {
    const nodeIds = getExpandedNodeIdsForSubstance(projection.hierarchyData, substanceSlug);
    if (nodeIds.length === 0) return;

    setExpandedNodes((prev) => {
      const next = new Set(prev);
      for (const nodeId of nodeIds) {
        next.add(nodeId);
      }
      return next;
    });
  }, [projection.hierarchyData]);

  return {
    graphData: projection.graphData,
    hierarchyData: projection.hierarchyData,
    searchTargets: projection.searchTargets,
    expandedNodes,
    toggleNode,
    collapseAll,
    expandToSubstance,
    stats: projection.stats,
  };
}
