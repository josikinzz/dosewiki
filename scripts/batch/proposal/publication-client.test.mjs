import { describe, expect, it, vi } from "vitest";

import { createDataOpsRunContext } from "../../lib/data-ops-run-context.mjs";
import { createReviewedSectionPublisher } from "./publication-client.mjs";

function context(argv) {
  return createDataOpsRunContext({
    operation: "publish reviewed section",
    intent: "generated-publication",
    argv,
    env: { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "postgresql://localhost/target-test" },
    targetUrlKeys: ["TARGET_POSTGRES_URL"],
    loadsEnvLocal: false,
  });
}

describe("future reviewed publication caller", () => {
  it("does not invoke the mutation interface until the full explicit write ceremony passes", async () => {
    const mutate = vi.fn();
    const publish = createReviewedSectionPublisher({
      context: context([]),
      actorEmail: "editor@example.com",
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE: "scoped-token" },
      mutate,
    });

    await expect(publish({ review: { status: "approved" } })).rejects.toThrow(/--write/);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("rejects the legacy master key even after write guards pass", async () => {
    const mutate = vi.fn();
    const publish = createReviewedSectionPublisher({
      context: context([
        "--write",
        "--confirm-write=publish-reviewed-section",
        "--expected-deployment=localhost/target-test",
      ]),
      actorEmail: "editor@example.com",
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_KEY: "master-token" },
      mutate,
    });

    await expect(publish({
      artifactDigest: "a".repeat(64),
      targetDeploymentFingerprint: "localhost/target-test",
      review: { status: "approved", artifactDigest: "a".repeat(64) },
    })).rejects.toThrow(/legacy admin key is not accepted/);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("passes only the scoped credential, actor, and reviewed proposal after guards", async () => {
    const mutate = vi.fn(async () => ({ status: "updated" }));
    const publish = createReviewedSectionPublisher({
      context: context([
        "--write",
        "--confirm-write=publish-reviewed-section",
        "--expected-deployment=localhost/target-test",
      ]),
      actorEmail: "editor@example.com",
      env: { DATA_BACKEND: "postgres",
        DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE: "scoped-token",
        DATA_ADMIN_KEY: "master-token",
      },
      mutate,
    });
    const reviewedProposal = {
      artifactDigest: "a".repeat(64),
      targetDeploymentFingerprint: "localhost/target-test",
      review: { status: "approved", artifactDigest: "a".repeat(64) },
      proposalId: "proposal-1",
    };

    await expect(publish(reviewedProposal)).resolves.toEqual({ status: "updated" });
    expect(mutate).toHaveBeenCalledWith({
      apiKey: "scoped-token",
      actorEmail: "editor@example.com",
      proposal: reviewedProposal,
    });
  });
});
