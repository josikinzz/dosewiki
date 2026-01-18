import { memo, useRef, useEffect, useCallback, useState } from "react";
import * as d3 from "d3";
import type { GraphNode, GraphLink, TooltipData } from "./graphTypes";
import { GRAPH_COLORS, getNodeColor, getNodeSize, getNodeFontSize } from "./graphColors";
import { useGraphSimulation } from "./useGraphSimulation";
import { GraphTooltip } from "./GraphTooltip";

interface SubstanceGraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  width: number;
  height: number;
  onNodeClick: (node: GraphNode) => void;
  onNodeDoubleClick: (node: GraphNode) => void;
  hoveredNodeId: string | null;
  onNodeHover: (node: GraphNode | null, event?: React.MouseEvent) => void;
  zoomRef: React.MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>;
}

export const SubstanceGraphCanvas = memo(function SubstanceGraphCanvas({
  nodes,
  links,
  width,
  height,
  onNodeClick,
  onNodeDoubleClick,
  hoveredNodeId,
  onNodeHover,
  zoomRef,
}: SubstanceGraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [, forceRender] = useState(0);
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);

  const handleTick = useCallback(() => {
    forceRender((n) => n + 1);
  }, []);

  const { getNodes, getLinks, fixNode, unfixNode, reheat } = useGraphSimulation(
    { nodes, links },
    { width, height, onTick: handleTick }
  );

  const simulationNodes = getNodes();
  const simulationLinks = getLinks();

  // Setup zoom behavior
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    // Initial center
    const initialTransform = d3.zoomIdentity.translate(0, 0).scale(1);
    svg.call(zoom.transform, initialTransform);

    return () => {
      svg.on(".zoom", null);
    };
  }, [zoomRef]);

  // Handle node drag
  const handleDragStart = useCallback(
    (event: React.MouseEvent, node: GraphNode) => {
      if (event.button !== 0) return; // Only left click

      const startX = event.clientX;
      const startY = event.clientY;
      const nodeStartX = node.x ?? 0;
      const nodeStartY = node.y ?? 0;

      // Get current zoom transform
      const transform = gRef.current
        ? d3.zoomTransform(svgRef.current as SVGSVGElement)
        : d3.zoomIdentity;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = (moveEvent.clientX - startX) / transform.k;
        const dy = (moveEvent.clientY - startY) / transform.k;
        fixNode(node, nodeStartX + dx, nodeStartY + dy);
        reheat();
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [fixNode, reheat]
  );

  const handleNodeMouseEnter = useCallback(
    (node: GraphNode, event: React.MouseEvent) => {
      onNodeHover(node, event);

      // Calculate tooltip position
      if (containerRef.current && svgRef.current) {
        const transform = d3.zoomTransform(svgRef.current);
        const containerRect = containerRef.current.getBoundingClientRect();
        const x = (node.x ?? 0) * transform.k + transform.x;
        const y = (node.y ?? 0) * transform.k + transform.y;

        setTooltipData({
          node,
          x,
          y,
        });
      }
    },
    [onNodeHover]
  );

  const handleNodeMouseLeave = useCallback(() => {
    onNodeHover(null);
    setTooltipData(null);
  }, [onNodeHover]);

  // Build set of connected node IDs for highlighting
  const connectedNodeIds = new Set<string>();
  if (hoveredNodeId) {
    connectedNodeIds.add(hoveredNodeId);
    for (const link of simulationLinks) {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;
      if (sourceId === hoveredNodeId) connectedNodeIds.add(targetId);
      if (targetId === hoveredNodeId) connectedNodeIds.add(sourceId);
    }
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="cursor-grab active:cursor-grabbing"
        style={{ background: GRAPH_COLORS.background }}
      >
        <g ref={gRef}>
          {/* Links */}
          {simulationLinks.map((link, i) => {
            const source = link.source as GraphNode;
            const target = link.target as GraphNode;
            const sourceId = source.id;
            const targetId = target.id;

            const isHighlighted =
              hoveredNodeId &&
              (sourceId === hoveredNodeId || targetId === hoveredNodeId);

            return (
              <line
                key={`link-${i}`}
                x1={source.x ?? 0}
                y1={source.y ?? 0}
                x2={target.x ?? 0}
                y2={target.y ?? 0}
                stroke={
                  isHighlighted
                    ? GRAPH_COLORS.links.highlighted
                    : GRAPH_COLORS.links.default
                }
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={hoveredNodeId && !isHighlighted ? 0.3 : 1}
              />
            );
          })}

          {/* Nodes */}
          {simulationNodes.map((node) => {
            const colors = getNodeColor(node.type);
            const size = getNodeSize(node.type);
            const fontSize = getNodeFontSize(node.type);
            const isHovered = hoveredNodeId === node.id;
            const isConnected = connectedNodeIds.has(node.id);
            const isDimmed = hoveredNodeId && !isConnected;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                style={{
                  cursor: node.type === "substance" ? "pointer" : "pointer",
                  opacity: isDimmed ? 0.3 : 1,
                }}
                onMouseDown={(e) => handleDragStart(e, node)}
                onMouseEnter={(e) => handleNodeMouseEnter(node, e)}
                onMouseLeave={handleNodeMouseLeave}
                onClick={() => onNodeClick(node)}
                onDoubleClick={() => onNodeDoubleClick(node)}
              >
                {/* Glow effect for hovered node */}
                {isHovered && (
                  <circle
                    r={size + 8}
                    fill="none"
                    stroke={GRAPH_COLORS.hover.glow}
                    strokeWidth={4}
                    filter="url(#glow)"
                  />
                )}

                {/* Main circle */}
                <circle
                  r={size}
                  fill={colors.fill}
                  stroke={isHovered ? GRAPH_COLORS.hover.stroke : colors.stroke}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                />

                {/* Expand/collapse indicator */}
                {node.type !== "substance" && node.childCount > 0 && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={colors.text}
                    fontSize={fontSize}
                    fontWeight="bold"
                    style={{ pointerEvents: "none" }}
                  >
                    {node.expanded ? "−" : "+"}
                  </text>
                )}

                {/* Label */}
                <text
                  y={size + 12}
                  textAnchor="middle"
                  fill={colors.text}
                  fontSize={fontSize}
                  style={{
                    pointerEvents: "none",
                    opacity: isHovered || node.type === "root" ? 1 : 0.8,
                  }}
                >
                  {node.label.length > 20
                    ? node.label.slice(0, 18) + "..."
                    : node.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* Glow filter definition */}
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <GraphTooltip data={tooltipData} containerRef={containerRef} />
    </div>
  );
});
