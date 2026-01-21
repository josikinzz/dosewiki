import { memo } from "react";
import { createPortal } from "react-dom";
import type { TooltipData } from "./graphTypes";
import { getNodeColor } from "./graphColors";

interface GraphTooltipProps {
  data: TooltipData | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const GraphTooltip = memo(function GraphTooltip({
  data,
  containerRef,
}: GraphTooltipProps) {
  if (!data || !containerRef.current) return null;

  const { node, x, y } = data;
  const colors = getNodeColor(node.type);

  // Position tooltip above the node
  const tooltipStyle: React.CSSProperties = {
    position: "absolute",
    left: x,
    top: y - 16,
    transform: "translate(-50%, -100%)",
    pointerEvents: "none",
    zIndex: 50,
  };

  const typeLabels: Record<string, string> = {
    root: "Root",
    psychoactive: "Psychoactive Class",
    chemical: "Chemical Class",
    substance: "Substance",
  };

  const tooltip = (
    <div style={tooltipStyle} className="animate-in fade-in-0 zoom-in-95 duration-100">
      <div
        className="rounded-xl border border-white/20 bg-[#1a1333]/95 px-3 py-2 shadow-xl backdrop-blur"
        style={{ borderColor: colors.stroke }}
      >
        <p className="text-sm font-semibold text-white">{node.label}</p>
        <p className="text-xs text-white/60">{typeLabels[node.type]}</p>
        {node.childCount > 0 && (
          <p className="mt-1 text-xs text-white/50">
            {node.type === "substance"
              ? `${node.childCount} effects`
              : `${node.childCount} ${node.type === "root" ? "classes" : "items"}`}
          </p>
        )}
        {node.type !== "substance" && (
          <p className="mt-1 text-xs text-fuchsia-300/80">
            Click to {node.expanded ? "collapse" : "expand"}
          </p>
        )}
        {node.type === "substance" && (
          <p className="mt-1 text-xs text-fuchsia-300/80">Double-click to view article</p>
        )}
      </div>
      <div
        className="mx-auto h-2 w-2 -translate-y-1 rotate-45 border-b border-r border-white/20 bg-[#1a1333]/95"
        style={{ borderColor: colors.stroke }}
      />
    </div>
  );

  return createPortal(tooltip, containerRef.current);
});
