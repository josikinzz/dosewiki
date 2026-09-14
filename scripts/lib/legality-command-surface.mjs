

export function buildLegalityWorkflowCommands({
  command,
  workflowAccessTargets,
  workflowDryRunPolicies,
  workflowDataOpsContextPolicies,
  workflowConvexUrlPolicies,
}) {
  return [
    command({
      name: "legality:export",
      purpose: "Export a live article into a legality research run packet.",
      env: ["SOURCE_CONVEX_URL or CONVEX_PUBLIC_READ_URL or VITE_CONVEX_URL"],
      scriptPath: "scripts/legality/export-run-packet.mjs",
      reads: [workflowAccessTargets.convexSource],
      writes: [workflowAccessTargets.localExportArtifacts],
      dryRun: workflowDryRunPolicies.none,
      dataOpsContext: workflowDataOpsContextPolicies.required,
      convexUrlPolicy: workflowConvexUrlPolicies.requiredSource,
    }),
    command({
      name: "legality:validate",
      purpose: "Validate a legality research draft before editorial review or apply.",
      scriptPath: "scripts/legality/validate-draft.ts",
      reads: [workflowAccessTargets.localArtifacts],
      dryRun: workflowDryRunPolicies.readOnly,
    }),
    command({
      name: "legality:apply",
      purpose: "Dry-run or apply a validated legality research draft to one live article.",
      env: [
        "CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE or CONVEX_ADMIN_KEY when writing",
        "VITE_CONVEX_URL for read-only dry-run compatibility",
        "TARGET_CONVEX_URL required for writes",
      ],
      scriptPath: "scripts/legality/apply-draft.mjs",
      reads: [workflowAccessTargets.localArtifacts, workflowAccessTargets.convexTarget],
      writes: [workflowAccessTargets.localArtifacts, workflowAccessTargets.convexTarget],
      dryRun: workflowDryRunPolicies.supported,
      confirmationFlag: "--confirm-legality-write",
      dataOpsContext: workflowDataOpsContextPolicies.required,
      convexUrlPolicy: workflowConvexUrlPolicies.requiredTarget,
    }),
  ];
}
