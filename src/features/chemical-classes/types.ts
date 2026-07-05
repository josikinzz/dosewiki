import type { DosageCategoryGroup } from "@/data/builders/library";
import type { IconName } from "@/components/common/Icon";

/** A representative drug-molecule structure shown for a chemical class tab. */
export interface ChemicalClassMolecule {
  slug: string;
  name: string;
  url: string; // "/molecules/<slug>.svg"
}

/**
 * One chemical-class tab in the Chemical Class Index. Its `panels` are the
 * substance-index-style category cards, one per psychoactive class, so the
 * client can hand them straight to `CategoryGrid`.
 */
export interface ChemicalClassIndexEntry {
  /** Canonical class slug, e.g. "phenethylamine". Doubles as the tab hash. */
  key: string;
  /** Display label, e.g. "Phenethylamine". */
  label: string;
  /** Tab icon (currently a shared hexagon for every class). */
  icon: IconName;
  /** Deduplicated count of substances in the class. */
  total: number;
  /** Chemistry/structure blurb shown above the panels. */
  description?: string;
  /**
   * Every drug-molecule structure in the class that has an SVG, ordered with the
   * curated featured set first (see `featuredCount`) and the rest following.
   * The client shuffles everything after the featured prefix.
   */
  molecules: ChemicalClassMolecule[];
  /** Number of leading `molecules` that are the curated featured picks. */
  featuredCount: number;
  /** Substance cards grouped by psychoactive class. */
  panels: DosageCategoryGroup[];
}

export interface ChemicalClassTreeNode {
  key: string;
  label: string;
  directTotal: number;
  rolledTotal: number;
  children: string[];
  parents: string[];
}

export interface ChemicalClassTreePayload {
  roots: string[];
  nodes: Record<string, ChemicalClassTreeNode>;
}

export interface ChemicalClassTreeSummary {
  key: string;
  label: string;
  rolledTotal: number;
}

export interface ChemicalClassDetail extends ChemicalClassIndexEntry {
  /** Ancestor chain, root-first, ending in this class. */
  lineage: ChemicalClassTreeSummary[];
  /**
   * Curated bioisosteres / positional isomers of this class. They sit at this
   * class's own indent level, above it, as collapsed rows (no subtree) — the
   * only "same level" lateral link. Other siblings are reached by walking up.
   */
  bioisosteres: ChemicalClassTreeSummary[];
  /** Direct subclasses, shown expanded beneath the active class. */
  children: ChemicalClassTreeSummary[];
  /** Secondary parents (this class is a DAG node), for "Also classified under". */
  otherParents: Array<{ key: string; label: string }>;
  /** `/molecules/classes/<key>.svg` — the generic R-group skeleton, if rendered. */
  structureUrl?: string;
}
