import type { NodeType } from "./graphTypes";

export const GRAPH_COLORS = {
  background: "#0f0a1f",

  nodes: {
    root: {
      fill: "#d946ef", // fuchsia-500
      stroke: "#f0abfc", // fuchsia-300
      text: "#ffffff",
    },
    psychoactive: {
      fill: "rgba(168, 85, 247, 0.8)", // violet-500 with opacity
      stroke: "#c4b5fd", // violet-300
      text: "#ffffff",
    },
    chemical: {
      fill: "rgba(217, 70, 239, 0.6)", // fuchsia-500 with opacity
      stroke: "#f0abfc", // fuchsia-300
      text: "#ffffff",
    },
    substance: {
      fill: "rgba(255, 255, 255, 0.1)",
      stroke: "rgba(255, 255, 255, 0.3)",
      text: "#ffffff",
    },
  },

  links: {
    default: "rgba(255, 255, 255, 0.08)",
    highlighted: "rgba(217, 70, 239, 0.4)",
  },

  hover: {
    stroke: "#f0abfc",
    glow: "rgba(217, 70, 239, 0.5)",
  },
} as const;

export const NODE_SIZES: Record<NodeType, number> = {
  root: 40,
  psychoactive: 24,
  chemical: 16,
  substance: 10,
};

export const NODE_FONT_SIZES: Record<NodeType, number> = {
  root: 14,
  psychoactive: 11,
  chemical: 9,
  substance: 8,
};

export function getNodeColor(type: NodeType): { fill: string; stroke: string; text: string } {
  return GRAPH_COLORS.nodes[type];
}

export function getNodeSize(type: NodeType): number {
  return NODE_SIZES[type];
}

export function getNodeFontSize(type: NodeType): number {
  return NODE_FONT_SIZES[type];
}
