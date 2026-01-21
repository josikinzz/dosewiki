import { memo } from "react";
import { GRAPH_COLORS, NODE_SIZES } from "./graphColors";
import type { NodeType } from "./graphTypes";

interface LegendItem {
  type: NodeType;
  label: string;
}

const LEGEND_ITEMS: LegendItem[] = [
  { type: "root", label: "Root" },
  { type: "psychoactive", label: "Psychoactive Class" },
  { type: "chemical", label: "Chemical Class" },
  { type: "substance", label: "Substance" },
];

interface GraphLegendProps {
  stats: {
    psychoactiveClassCount: number;
    chemicalClassCount: number;
    substanceCount: number;
  };
}

export const GraphLegend = memo(function GraphLegend({ stats }: GraphLegendProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/70">
      {LEGEND_ITEMS.map(({ type, label }) => {
        const colors = GRAPH_COLORS.nodes[type];
        const size = Math.min(NODE_SIZES[type] / 2, 10);
        const count =
          type === "psychoactive"
            ? stats.psychoactiveClassCount
            : type === "chemical"
              ? stats.chemicalClassCount
              : type === "substance"
                ? stats.substanceCount
                : 1;

        return (
          <div key={type} className="flex items-center gap-2">
            <svg width={size * 2 + 4} height={size * 2 + 4} className="flex-shrink-0">
              <circle
                cx={size + 2}
                cy={size + 2}
                r={size}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={1.5}
              />
            </svg>
            <span>
              {label}
              {type !== "root" && (
                <span className="ml-1 text-white/50">({count})</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
});
