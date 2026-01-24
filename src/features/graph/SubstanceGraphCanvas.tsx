import { memo, useRef, useEffect, useCallback, useState, useMemo } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from "d3-zoom";
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
  zoomRef: React.MutableRefObject<ZoomBehavior<SVGSVGElement, unknown> | null>;
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
  const linksRef = useRef<SVGGElement>(null);
  const nodesRef = useRef<SVGGElement>(null);
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);

  // Direct DOM update via D3 - bypasses React for 60fps performance
  const handleTick = useCallback(() => {
    if (!linksRef.current || !nodesRef.current) return;

    // Update link positions directly
    select(linksRef.current)
      .selectAll<SVGLineElement, GraphLink>("line")
      .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
      .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
      .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
      .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

    // Update node positions directly
    select(nodesRef.current)
      .selectAll<SVGGElement, GraphNode>("g")
      .attr("transform", (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`);
  }, []);

  const { getNodes, getLinks, fixNode, unfixNode, reheat } = useGraphSimulation(
    { nodes, links },
    { width, height, onTick: handleTick }
  );

  const simulationNodes = getNodes();
  const simulationLinks = getLinks();

  // Bind D3 data to DOM elements after React renders them
  // This enables D3 to update positions directly without React re-renders
  useEffect(() => {
    if (!linksRef.current || !nodesRef.current) return;

    // Bind link data to line elements
    select(linksRef.current)
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(simulationLinks, (_, i) => i);

    // Bind node data to g elements
    select(nodesRef.current)
      .selectAll<SVGGElement, GraphNode>("g")
      .data(simulationNodes, (d) => d.id);
  }, [simulationNodes, simulationLinks]);

  // Setup zoom behavior
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const svg = select(svgRef.current);
    const g = select(gRef.current);

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);
    zoomRef.current = zoomBehavior;

    // Initial center
    const initialTransform = zoomIdentity.translate(0, 0).scale(1);
    svg.call(zoomBehavior.transform, initialTransform);

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
        ? zoomTransform(svgRef.current as SVGSVGElement)
        : zoomIdentity;

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
        const transform = zoomTransform(svgRef.current);
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

  // Build set of connected node IDs for highlighting (memoized to prevent recreation every render)
  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!hoveredNodeId) return ids;
    ids.add(hoveredNodeId);
    for (const link of simulationLinks) {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;
      if (sourceId === hoveredNodeId) ids.add(targetId);
      if (targetId === hoveredNodeId) ids.add(sourceId);
    }
    return ids;
  }, [hoveredNodeId, simulationLinks]);

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
          {/* Links - D3 updates positions directly via linksRef */}
          <g ref={linksRef}>
            {simulationLinks.map((link) => {
              const source = link.source as GraphNode;
              const target = link.target as GraphNode;
              const sourceId = source.id;
              const targetId = target.id;

              const isHighlighted =
                hoveredNodeId &&
                (sourceId === hoveredNodeId || targetId === hoveredNodeId);

              return (
                <line
                  key={`${sourceId}-${targetId}`}
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
          </g>

          {/* Nodes - D3 updates positions directly via nodesRef */}
          <g ref={nodesRef}>
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
