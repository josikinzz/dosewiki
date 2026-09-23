/**
 * Section, gate, and schema vocabulary shared by the Pi run manifest controller.
 */

export const CITABLE_SECTIONS = [
  "summary",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
];
export const SECTION_STATUSES = new Set([
  "checked",
  "missing_preserve_original",
  "failed_preserve_original",
  // Terminal skip statuses for subsection-scoped runs (task.selectedSections).
  "skipped_already_cited",
  "skipped_empty",
  "not_selected",
]);
const SKIP_STATUSES = new Set(["skipped_already_cited", "skipped_empty", "not_selected"]);

export function normalizeTaskSelectedSections(task) {
  const selected = task?.selectedSections;
  if (selected === undefined || selected === null) return null;
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new Error("citation-task.json selectedSections must be a non-empty array when present");
  }
  const seen = new Set();
  for (const section of selected) {
    if (!CITABLE_SECTIONS.includes(section)) {
      throw new Error(`citation-task.json selectedSections entry ${section} is not a citable section`);
    }
    if (seen.has(section)) {
      throw new Error(`citation-task.json selectedSections contains duplicate entry ${section}`);
    }
    seen.add(section);
  }
  return [...selected];
}

export function skipStatusForReason(reason) {
  if (reason === "empty") return "skipped_empty";
  if (reason === "already_cited") return "skipped_already_cited";
  return "not_selected";
}
export const GATES = [
  "preflight",
  "remap",
  "section_rechecks",
  "proactive_scan",
  "article_wide_packet",
  "article_wide_sanitize",
  "article_wide_residue_scan",
  "article_wide_check",
  "assemble_draft",
  "validate",
  "validate_patches",
  "final_review_surface_scan",
];
export const RECONCILIATION_GATES = [
  "remap",
  "section_rechecks",
  "proactive_scan",
  "article_wide_packet",
  "article_wide_sanitize",
  "article_wide_residue_scan",
];
export const GATE_PREREQUISITES = {
  preflight: [],
  remap: ["preflight", "all_sections_terminal"],
  section_rechecks: ["remap"],
  proactive_scan: ["section_rechecks"],
  article_wide_packet: ["proactive_scan"],
  article_wide_sanitize: ["article_wide_packet"],
  article_wide_residue_scan: ["article_wide_sanitize"],
  article_wide_check: ["article_wide_residue_scan"],
  assemble_draft: ["article_wide_check"],
  validate: ["assemble_draft"],
  validate_patches: ["validate"],
  final_review_surface_scan: ["validate_patches"],
};
export const GATE_SCOPES = {
  preflight: ["task"],
  remap: ["task", "sections"],
  section_rechecks: ["task", "sections"],
  proactive_scan: ["task", "sections"],
  article_wide_packet: ["task", "sections", "articleWideInput"],
  article_wide_sanitize: ["task", "sections", "articleWideInput"],
  article_wide_residue_scan: ["task", "sections", "articleWideInput"],
  article_wide_check: ["task", "sections", "articleWideInput", "articleWide"],
  assemble_draft: ["task", "sections", "articleWideInput", "articleWide", "draft"],
  validate: ["task", "sections", "articleWideInput", "articleWide", "draft"],
  validate_patches: ["task", "sections", "articleWideInput", "articleWide", "draft"],
  final_review_surface_scan: ["articleWide", "draft", "report"],
};
export const CORRECTIVE_RERUN_SCHEMA = "dosewiki_pi_citation_corrective_rerun_v1";
export const MANIFEST_FILE = "pi-run-manifest.json";
