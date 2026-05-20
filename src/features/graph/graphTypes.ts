import type { SimulationNodeDatum, SimulationLinkDatum } from "d3";

export type NodeType = "root" | "psychoactive" | "chemical" | "substance";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  type: NodeType;
  label: string;
  slug?: string;
  parentIds: string[];
  childCount: number;
  expanded: boolean;
  // D3 will add x, y, vx, vy, fx, fy
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: "root-psychoactive" | "psychoactive-chemical" | "chemical-substance";
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface TooltipData {
  node: GraphNode;
  x: number;
  y: number;
}

export interface SubstanceData {
  title: string;
  slug: string;
  psychoactiveClasses: string[];
  chemicalClasses: string[];
  effectCount: number;
}

export interface HierarchyData {
  psychoactiveClasses: Map<string, Set<string>>; // class -> chemical classes
  chemicalClasses: Map<string, Set<string>>; // chemical class -> substances
  substances: Map<string, SubstanceData>; // slug -> substance data
}

export interface GraphSearchTarget {
  slug: string;
  title: string;
}

export interface GraphStats {
  psychoactiveClassCount: number;
  chemicalClassCount: number;
  substanceCount: number;
}

export interface GraphProjection {
  graphData: GraphData;
  hierarchyData: HierarchyData;
  searchTargets: GraphSearchTarget[];
  stats: GraphStats;
}
