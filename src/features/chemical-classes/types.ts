import type { DosageCategoryGroup } from "@/data/builders/library";
import type { IconName } from "@/components/common/Icon";

/** One substance's skeletal-structure SVG, joined to panel rows by slug. */
export interface ChemicalClassMolecule {
  slug: string;
  name: string;
  url: string; // Postgres image route when published; static fallback otherwise.
}

/**
 * One chemical-class entry. Its `panels` are the substance-index-style
 * category groups, one per psychoactive class, rendered as structure-
 * comparison panels on the class detail page.
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
  /** Every drug-molecule structure in the class that has an SVG. */
  molecules: ChemicalClassMolecule[];
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
  /**
   * Versioned Postgres override image URL (`/api/molecules/classes/<key>?v=…`),
   * or `null` when the class has no stored drawing yet.
   */
  structureUrl: string | null;
}
