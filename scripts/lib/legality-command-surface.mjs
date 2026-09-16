

export function buildLegalityWorkflowCommands({
  command,
  workflowAccessTargets,
  workflowDryRunPolicies,
  workflowDataOpsContextPolicies,
  workflowDataUrlPolicies,
}) {
  return [
    command({
      name: "legality:export",
      purpose: "Export a live article into a legality research run packet.",
      env: ["DATA_BACKEND=postgres", "--source-url or SOURCE_POSTGRES_URL (otherwise the selected Postgres target)", "--allow-remote and POSTGRES_IMPORT_CONFIRM=<hostname> for remote access"],
      scriptPath: "scripts/legality/export-run-packet.mjs",
      reads: [workflowAccessTargets.dataSource],
      writes: [workflowAccessTargets.localExportArtifacts],
      dryRun: workflowDryRunPolicies.none,
      dataOpsContext: workflowDataOpsContextPolicies.required,
      dataUrlPolicy: workflowDataUrlPolicies.requiredSource,
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
        "DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE or DATA_ADMIN_KEY when writing",
        "DATA_BACKEND=postgres",
        "TARGET_POSTGRES_URL or --target required for dry-run and write",
        "--expected-deployment=<host/database> matching the target",
        "--allow-remote and POSTGRES_IMPORT_CONFIRM=<hostname> for remote access",
      ],
      scriptPath: "scripts/legality/apply-draft.mjs",
      reads: [workflowAccessTargets.localArtifacts, workflowAccessTargets.dataTarget],
      writes: [workflowAccessTargets.localArtifacts, workflowAccessTargets.dataTarget],
      dryRun: workflowDryRunPolicies.supported,
      confirmationFlag: "--confirm-legality-write",
      dataOpsContext: workflowDataOpsContextPolicies.required,
      dataUrlPolicy: workflowDataUrlPolicies.requiredTarget,
    }),
  ];
}
