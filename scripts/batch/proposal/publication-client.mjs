import {
  assertDataOpsWriteAllowed,
  requireAdminIntentToken,
} from "../../lib/data-ops-run-context.mjs";
import { requireBatchProposalTargetUrl } from "../lib/batch-targets.mjs";

/**
 * Guarded interface for a future explicit apply command or protected route.
 * This module intentionally owns no CLI and no Postgres client. A caller must
 * supply the single reviewed-section mutation invocation after all production
 * write ceremony checks pass.
 */
export function createReviewedSectionPublisher({ context, actorEmail, env = process.env, mutate }) {
  if (typeof mutate !== "function") {
    throw new Error("A reviewed-section mutation caller is required.");
  }

  return async function publishReviewedSection(proposal) {
    requireBatchProposalTargetUrl(context);
    assertDataOpsWriteAllowed(context);
    if (typeof actorEmail !== "string" || !actorEmail.trim()) {
      throw new Error("A delegated editor actorEmail is required for reviewed publication.");
    }
    if (!proposal || proposal.review?.status !== "approved") {
      throw new Error("Only an explicitly approved reviewed proposal may be published.");
    }
    if (!proposal.artifactDigest || proposal.review.artifactDigest !== proposal.artifactDigest) {
      throw new Error("The approval must reference the proposal's exact reviewed artifact digest.");
    }
    if (proposal.targetDeploymentFingerprint !== context.deploymentFingerprint) {
      throw new Error("The reviewed proposal target does not match the explicit publication deployment.");
    }
    const credential = requireAdminIntentToken("generatedPublicationWrite", { env });
    if (credential.source !== "scoped") {
      throw new Error("Generated publication requires DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE; the legacy admin key is not accepted.");
    }

    return mutate({
      apiKey: credential.token,
      actorEmail: actorEmail.trim(),
      proposal,
    });
  };
}
