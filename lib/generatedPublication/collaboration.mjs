import { canonicalHash, canonicalSerialize, sha256Text } from "./canonical.mjs";

export const COLLABORATION_ARTIFACT_KIND = "codex_collaboration_section_draft";
export const COLLABORATION_AUDIT_VERSION = "codex-collaboration-section-draft-v1";
const AUDIT_KEYS = ["version", "section", "promptHash", "excerptHash", "inputHash", "receiptHash", "receipt"].sort();
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isDigest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;

export function collaborationPublicationErrors(proposal) {
  const errors = [];
  const audit = proposal.collaborationAudit;
  if (proposal.sourceArtifactKind !== COLLABORATION_ARTIFACT_KIND) {
    if (audit !== undefined) errors.push("collaborationAudit requires codex_collaboration_section_draft sourceArtifactKind");
    return errors;
  }
  if (!isObject(audit)) return ["collaborationAudit is required for collaboration section drafts"];
  if (canonicalSerialize(Object.keys(audit).sort()) !== canonicalSerialize(AUDIT_KEYS)) {
    errors.push("collaborationAudit must contain exactly version, section, promptHash, excerptHash, inputHash, receiptHash, and receipt");
  }
  if (audit.version !== COLLABORATION_AUDIT_VERSION) errors.push("Unsupported collaborationAudit.version");
  if (audit.section !== proposal.profile) errors.push("collaborationAudit.section must equal the selected profile");
  for (const field of ["promptHash", "excerptHash", "inputHash", "receiptHash"]) {
    if (!isDigest(audit[field])) errors.push(`collaborationAudit.${field} must be a lowercase SHA-256 digest`);
  }
  const receipt = audit.receipt;
  if (!isObject(receipt)) return [...errors, "collaborationAudit.receipt must be the captured collaboration receipt"];
  if (canonicalHash(receipt) !== audit.receiptHash) errors.push("Collaboration receipt digest mismatch");
  if (receipt.transport !== "codex-collaboration-subagent" || receipt.forkTurns !== "none") {
    errors.push("Collaboration receipt requires an isolated fresh collaboration subagent");
  }
  const taskPath = receipt.collaborationTaskPath ?? receipt.actualTaskPath;
  const agentId = receipt.collaborationThreadId ?? receipt.actualAgentId;
  if (!nonempty(taskPath) || !/^\/[a-z0-9_/-]+$/i.test(taskPath) ||
      typeof agentId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(agentId)) {
    errors.push("Collaboration receipt must name its actual task path and agent UUID");
  }
  if (receipt.inputHash !== audit.inputHash || !isDigest(receipt.inputHash)) errors.push("Collaboration input hash mismatch");
  if (receipt.rawResponseSha256 !== proposal.rawResponseHash || !isDigest(receipt.rawResponseSha256)) {
    errors.push("Collaboration raw response hash mismatch");
  }
  for (const field of ["wireModelVerified", "wireEffortVerified", "wireToolsVerified", "sdkReceipt"]) {
    if (receipt[field] !== false) errors.push(`Collaboration receipt must explicitly retain ${field}: false`);
  }
  if (receipt.localRuntimeToolsObserved !== undefined && receipt.localRuntimeToolsObserved !== 0) {
    errors.push("Collaboration receipt cannot report observed worker tools");
  }
  if (receipt.wireDispatchBytesVerified !== undefined && receipt.wireDispatchBytesVerified !== false) {
    errors.push("Collaboration receipt cannot claim verified wire input bytes");
  }
  if (!nonempty(receipt.capturedAt) || !Number.isFinite(Date.parse(receipt.capturedAt))) {
    errors.push("Collaboration receipt requires its actual capture timestamp");
  }
  return errors;
}

export function collaborationManifestErrors(proposal, manifest) {
  if (proposal.sourceArtifactKind !== COLLABORATION_ARTIFACT_KIND) return [];
  const errors = collaborationPublicationErrors(proposal);
  const audit = proposal.collaborationAudit;
  if (!isObject(audit)) return errors;
  if (!isObject(manifest.collaborationAudit) || canonicalSerialize(manifest.collaborationAudit) !== canonicalSerialize(audit)) {
    errors.push("Manifest collaborationAudit must equal the reviewed proposal audit");
  }
  if (typeof manifest.prompt?.content !== "string" || sha256Text(manifest.prompt.content) !== audit.promptHash) {
    errors.push("Frozen collaboration prompt hash mismatch");
  }
  if (typeof manifest.exactExcerpt !== "string" || sha256Text(manifest.exactExcerpt) !== audit.excerptHash) {
    errors.push("Frozen collaboration excerpt hash mismatch");
  }
  const messages = manifest.messages;
  if (!Array.isArray(messages) || messages.length !== 2 ||
      messages.some((message, index) => !isObject(message) || message.role !== ["system", "user"][index] ||
        !nonempty(message.content) || Object.keys(message).some((key) => key !== "role" && key !== "content")) ||
      canonicalHash(messages) !== audit.inputHash) {
    errors.push("Frozen collaboration messages must match the captured isolated input hash");
  }
  if (Array.isArray(messages) && messages[1]?.content !== `${manifest.prompt?.content}\n\nEXACT SECTION EXCERPTS\n${manifest.exactExcerpt}`) {
    errors.push("Frozen collaboration user message must contain exactly its prompt and excerpts");
  }
  return errors;
}
