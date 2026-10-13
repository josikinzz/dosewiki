import { msg } from "@/i18n/messages";

/** Shared source-usage coverage copy, localized by the reader interface. */
export const GLOSSARY_USAGE_COVERAGE = msg("Canonical index and replication filter labels, plus headings, dosage and duration fields, and English text in public substance, effect, and published library articles. Counts are source locations, not pages or repeated mentions. Artist badges and other site content are not searched.");

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

export type GlossaryUsageMap = Record<string, GlossaryUsageResponse>;
