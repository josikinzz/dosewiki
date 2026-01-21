import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import type { GraphNode, GraphLink, GraphData } from "./graphTypes";
import { getNodeSize } from "./graphColors";

interface UseGraphSimulationOptions {
  width: number;
  height: number;
  onTick: () => void;
}

export function useGraphSimulation(
  graphData: GraphData,
  options: UseGraphSimulationOptions
) {
  const { width, height, onTick } = options;
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  // Initialize or update simulation when graph data changes
  useEffect(() => {
    if (width === 0 || height === 0) return;

    // Create a copy of nodes and links to avoid mutating original data
    const nodes = graphData.nodes.map((n) => ({ ...n }));
    const links = graphData.links.map((l) => ({ ...l }));

    // If simulation exists, update it
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // Create new simulation
    const simulation = d3
      .forceSimulation<GraphNode, GraphLink>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            // Shorter links for root connections
            const sourceType = typeof d.source === "string" ? null : d.source?.type;
            const targetType = typeof d.target === "string" ? null : d.target?.type;
            if (sourceType === "root") return 120;
            if (sourceType === "psychoactive" && targetType === "chemical") return 80;
            return 50;
          })
          .strength(0.5)
      )
      .force("charge", d3.forceManyBody().strength(-200).distanceMax(400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide<GraphNode>().radius((d) => getNodeSize(d.type) + 5)
      )
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .alphaDecay(0.02)
      .velocityDecay(0.3)
      .on("tick", onTick);

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [graphData.nodes, graphData.links, width, height, onTick]);

  // Update center force when dimensions change
  useEffect(() => {
    if (simulationRef.current && width > 0 && height > 0) {
      simulationRef.current.force("center", d3.forceCenter(width / 2, height / 2));
      simulationRef.current.force("x", d3.forceX(width / 2).strength(0.05));
      simulationRef.current.force("y", d3.forceY(height / 2).strength(0.05));
      simulationRef.current.alpha(0.3).restart();
    }
  }, [width, height]);

  const getNodes = useCallback(() => {
    return simulationRef.current?.nodes() ?? [];
  }, []);

  const getLinks = useCallback(() => {
    const linkForce = simulationRef.current?.force("link") as
      | d3.ForceLink<GraphNode, GraphLink>
      | undefined;
    return linkForce?.links() ?? [];
  }, []);

  const reheat = useCallback(() => {
    simulationRef.current?.alpha(0.5).restart();
  }, []);

  const stop = useCallback(() => {
    simulationRef.current?.stop();
  }, []);

  const fixNode = useCallback((node: GraphNode, x: number, y: number) => {
    node.fx = x;
    node.fy = y;
  }, []);

  const unfixNode = useCallback((node: GraphNode) => {
    node.fx = null;
    node.fy = null;
  }, []);

  return {
    simulation: simulationRef.current,
    getNodes,
    getLinks,
    reheat,
    stop,
    fixNode,
    unfixNode,
  };
}
