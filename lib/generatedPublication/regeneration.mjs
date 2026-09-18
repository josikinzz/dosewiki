import { canonicalSerialize, presenceAwareValue } from "./canonical.mjs";
import {
  GENERATION_SECTIONS,
  GENERATION_MODEL,
  GENERATION_THINKING,
  REGENERATION_ARTIFACT_KIND,
  REGENERATION_AUDIT_VERSION,
  isRegenerationEligible,
} from "../sectionGeneration/contract.mjs";

export { REGENERATION_ARTIFACT_KIND };
const AUDIT_KEYS = ["version", "section", "promptHash", "excerptHash", "model", "thinking"].sort();
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function containsCitationMarker(value) {
  if (typeof value === "string") return /\[cite:/i.test(value);
  if (Array.isArray(value)) return value.some(containsCitationMarker);
  if (isObject(value)) {
    return Object.entries(value).some(([key, entry]) => containsCitationMarker(key) || containsCitationMarker(entry));
  }
  return false;
}

/** The same closed replacement boundary is enforced before local publication and in the transaction. */
export function regenerationPublicationErrors(proposal, { liveArticle } = {}) {
  const errors = [];
  if (proposal.sourceArtifactKind !== REGENERATION_ARTIFACT_KIND) {
    if (proposal.regenerationAudit !== undefined) errors.push("regenerationAudit requires excerpt_section_regeneration sourceArtifactKind");
    return errors;
  }
  const audit = proposal.regenerationAudit;
  if (!isObject(audit)) {
    errors.push("regenerationAudit is required for excerpt section regeneration");
  } else {
    if (canonicalSerialize(Object.keys(audit).sort()) !== canonicalSerialize(AUDIT_KEYS)) {
      errors.push("regenerationAudit must contain exactly version, section, promptHash, excerptHash, model, and thinking");
    }
    if (audit.version !== REGENERATION_AUDIT_VERSION) errors.push("Unsupported regenerationAudit.version");
    if (audit.model !== GENERATION_MODEL) errors.push(`regenerationAudit.model must be ${GENERATION_MODEL}`);
    if (audit.thinking !== GENERATION_THINKING) errors.push(`regenerationAudit.thinking must be ${GENERATION_THINKING}`);
    for (const field of ["promptHash", "excerptHash"]) {
      if (typeof audit[field] !== "string" || !/^[a-f0-9]{64}$/.test(audit[field])) {
        errors.push(`regenerationAudit.${field} must be a lowercase SHA-256 digest`);
      }
    }
    if (audit.section !== proposal.profile) errors.push("regenerationAudit.section must equal the selected profile");
  }
  if (!GENERATION_SECTIONS.includes(proposal.profile)) errors.push("Regeneration is restricted to the five non-legality narrative sections");
  if (proposal.section !== undefined && proposal.section !== proposal.profile) errors.push("Selected section must equal the regeneration profile");
  if (proposal.correctionAudit !== undefined || proposal.markerChanges !== undefined || proposal.claimEvidence !== undefined) {
    errors.push("Regeneration cannot carry correction or citation audit metadata");
  }
  if (!Array.isArray(proposal.approvedPaths) || proposal.approvedPaths.length !== 1 || proposal.approvedPaths[0] !== proposal.profile) {
    errors.push("Regeneration must approve exactly its selected profile field");
  }
  for (const [label, article] of [["baseArticle", proposal.baseArticle], ["proposedArticle", proposal.proposedArticle]]) {
    if (!isObject(article) || !isRegenerationEligible(article)) errors.push(`${label} is not eligible for section regeneration`);
  }
  if (isObject(proposal.baseArticle) && isObject(proposal.proposedArticle)) {
    const changed = [...new Set([...Object.keys(proposal.baseArticle), ...Object.keys(proposal.proposedArticle)])]
      .filter((field) => canonicalSerialize(presenceAwareValue(proposal.baseArticle, field)) !== canonicalSerialize(presenceAwareValue(proposal.proposedArticle, field)));
    if (changed.length !== 1 || changed[0] !== proposal.profile) errors.push("Regeneration must replace only the selected section and preserve all other article fields");
    const section = proposal.proposedArticle[proposal.profile];
    if (section === undefined || section === null || section === "") errors.push("Regeneration requires a complete replacement section");
    if (containsCitationMarker(section)) errors.push("Regenerated section must contain no citation markers, retained or new");
  }
  if (liveArticle !== undefined && (!isObject(liveArticle) || !isRegenerationEligible(liveArticle))) {
    errors.push("Live article is no longer eligible for section regeneration");
  }
  return errors;
}
