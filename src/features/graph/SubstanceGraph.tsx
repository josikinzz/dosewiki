import { memo, useRef, useState, useCallback, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { useGraphData } from "./useGraphData";
import { SubstanceGraphCanvas } from "./SubstanceGraphCanvas";
import { GraphControls } from "./GraphControls";
import { GraphLegend } from "./GraphLegend";
import type { GraphNode } from "./graphTypes";
import { useTheme } from "@/context/ThemeContext";

interface SubstanceGraphProps {
  onNavigateToSubstance: (slug: string) => void;
}

export const SubstanceGraph = memo(function SubstanceGraph({
  onNavigateToSubstance,
}: SubstanceGraphProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { graphData, stats, toggleNode, collapseAll, expandToSubstance, hierarchyData } =
    useGraphData();

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Search functionality
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const results: string[] = [];

    for (const [slug, data] of hierarchyData.substances) {
      if (
        data.title.toLowerCase().includes(query) ||
        slug.toLowerCase().includes(query)
      ) {
        results.push(slug);
      }
    }

    return results.sort();
  }, [searchQuery, hierarchyData.substances]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSelectSearchResult = useCallback(
    (slug: string) => {
      expandToSubstance(slug);
    },
    [expandToSubstance]
  );

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (zoomRef.current && containerRef.current) {
      const svg = containerRef.current.querySelector("svg");
      if (svg) {
        d3.select(svg as SVGSVGElement)
          .transition()
          .duration(300)
          .call(zoomRef.current.scaleBy, 1.3);
      }
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (zoomRef.current && containerRef.current) {
      const svg = containerRef.current.querySelector("svg");
      if (svg) {
        d3.select(svg as SVGSVGElement)
          .transition()
          .duration(300)
          .call(zoomRef.current.scaleBy, 0.7);
      }
    }
  }, []);

  const handleReset = useCallback(() => {
    collapseAll();
    if (zoomRef.current && containerRef.current) {
      const svg = containerRef.current.querySelector("svg");
      if (svg) {
        d3.select(svg as SVGSVGElement)
          .transition()
          .duration(500)
          .call(zoomRef.current.transform, d3.zoomIdentity);
      }
    }
  }, [collapseAll]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.type !== "substance") {
        toggleNode(node.id);
      }
    },
    [toggleNode]
  );

  const handleNodeDoubleClick = useCallback(
    (node: GraphNode) => {
      if (node.type === "substance" && node.slug) {
        onNavigateToSubstance(node.slug);
      }
    },
    [onNavigateToSubstance]
  );

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNodeId(node?.id ?? null);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <GraphControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        onSearch={handleSearch}
        searchResults={searchResults}
        onSelectSearchResult={handleSelectSearchResult}
      />

      <div
        ref={containerRef}
        className="relative min-h-[500px] w-full overflow-hidden rounded-xl border border-white/10"
        style={{ height: "60vh", maxHeight: "700px" }}
      >
        {dimensions.width > 0 && dimensions.height > 0 ? (
          <SubstanceGraphCanvas
            nodes={graphData.nodes}
            links={graphData.links}
            width={dimensions.width}
            height={dimensions.height}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            hoveredNodeId={hoveredNodeId}
            onNodeHover={handleNodeHover}
            zoomRef={zoomRef}
            theme={theme}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
          </div>
        )}
      </div>

      <GraphLegend stats={stats} theme={theme} />

      <p className="text-center text-xs text-white/50">
        Click nodes to expand/collapse. Double-click substances to view article.
        Drag to move nodes. Scroll to zoom. Drag background to pan.
      </p>
    </div>
  );
});
