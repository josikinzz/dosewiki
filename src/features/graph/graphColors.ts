import type { NodeType } from "./graphTypes";
import type { ThemeName } from "@/context/ThemeContext";

export const GRAPH_COLORS = {
  dark: {
    background: "var(--theme-page-end)",
    nodes: {
      root: {
        fill: "var(--theme-accent)",
        stroke: "var(--theme-accent-strong)",
        text: "var(--theme-text-primary)",
      },
      psychoactive: {
        fill: "color-mix(in srgb, var(--theme-accent) 72%, transparent)",
        stroke: "color-mix(in srgb, var(--theme-accent-strong) 84%, white 16%)",
        text: "var(--theme-text-primary)",
      },
      chemical: {
        fill: "color-mix(in srgb, var(--theme-accent) 54%, transparent)",
        stroke: "var(--theme-accent-strong)",
        text: "var(--theme-text-primary)",
      },
      substance: {
        fill: "color-mix(in srgb, var(--theme-surface-soft) 92%, transparent)",
        stroke: "color-mix(in srgb, var(--theme-text-muted) 44%, transparent)",
        text: "var(--theme-text-primary)",
      },
    },
    links: {
      default: "color-mix(in srgb, var(--theme-text-faint) 18%, transparent)",
      highlighted: "color-mix(in srgb, var(--theme-accent) 42%, transparent)",
    },
    hover: {
      stroke: "var(--theme-accent-strong)",
      glow: "color-mix(in srgb, var(--theme-accent) 48%, transparent)",
    },
  },
  light: {
    background: "var(--theme-page-mid)",
    nodes: {
      root: {
        fill: "var(--theme-accent)",
        stroke: "var(--theme-accent-strong)",
        text: "white",
      },
      psychoactive: {
        fill: "color-mix(in srgb, var(--theme-accent) 72%, transparent)",
        stroke: "color-mix(in srgb, var(--theme-accent-strong) 88%, transparent)",
        text: "white",
      },
      chemical: {
        fill: "color-mix(in srgb, var(--theme-accent) 48%, transparent)",
        stroke: "var(--theme-accent)",
        text: "white",
      },
      substance: {
        fill: "color-mix(in srgb, var(--theme-surface-strong) 96%, white 4%)",
        stroke: "color-mix(in srgb, var(--theme-text-faint) 50%, transparent)",
        text: "var(--theme-text-primary)",
      },
    },
    links: {
      default: "color-mix(in srgb, var(--theme-text-faint) 24%, transparent)",
      highlighted: "color-mix(in srgb, var(--theme-accent) 34%, transparent)",
    },
    hover: {
      stroke: "var(--theme-accent)",
      glow: "color-mix(in srgb, var(--theme-accent) 38%, transparent)",
    },
  },
} as const;

export const NODE_SIZES: Record<NodeType, number> = {
  root: 42,
  psychoactive: 28,
  chemical: 20,
  substance: 14,
};

export const NODE_FONT_SIZES: Record<NodeType, number> = {
  root: 15,
  psychoactive: 12,
  chemical: 10,
  substance: 9,
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
