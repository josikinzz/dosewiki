import type { NodeType } from "./graphTypes";
import type { ThemeName } from "@/context/ThemeContext";

export const GRAPH_COLORS = {
  dark: {
    background: "#0f0a1f",
    nodes: {
      root: {
        fill: "#d946ef",
        stroke: "#f0abfc",
        text: "#ffffff",
      },
      psychoactive: {
        fill: "rgba(168, 85, 247, 0.8)",
        stroke: "#c4b5fd",
        text: "#ffffff",
      },
      chemical: {
        fill: "rgba(217, 70, 239, 0.6)",
        stroke: "#f0abfc",
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
  },
  light: {
    background: "#f8f1ff",
    nodes: {
      root: {
        fill: "#c026d3",
        stroke: "#86198f",
        text: "#ffffff",
      },
      psychoactive: {
        fill: "rgba(139, 92, 246, 0.72)",
        stroke: "#7c3aed",
        text: "#ffffff",
      },
      chemical: {
        fill: "rgba(217, 70, 239, 0.42)",
        stroke: "#c026d3",
        text: "#ffffff",
      },
      substance: {
        fill: "rgba(255, 255, 255, 0.88)",
        stroke: "rgba(93, 56, 123, 0.28)",
        text: "#261534",
      },
    },
    links: {
      default: "rgba(93, 56, 123, 0.12)",
      highlighted: "rgba(192, 38, 211, 0.32)",
    },
    hover: {
      stroke: "#c026d3",
      glow: "rgba(192, 38, 211, 0.32)",
    },
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

export function getGraphColors(theme: ThemeName) {
  return GRAPH_COLORS[theme];
}

export function getNodeColor(theme: ThemeName, type: NodeType): { fill: string; stroke: string; text: string } {
  return GRAPH_COLORS[theme].nodes[type];
}

export function getNodeSize(type: NodeType): number {
  return NODE_SIZES[type];
}

export function getNodeFontSize(type: NodeType): number {
  return NODE_FONT_SIZES[type];
}
