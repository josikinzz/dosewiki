export type GlossaryUsageNode = {
  /** A stable source location, not a page or an occurrence count. */
  id: string;
  href: string;
  title: string;
  context: string;
  kind: "label" | "content";
};

export type GlossaryUsageResponse = {
  term: string;
  nodes: GlossaryUsageNode[];
  totalSourceNodes: number;
  nextOffset: number | null;
  /** Coverage is deliberately partial, even when every matching node is returned. */
  coverage: string;
};
