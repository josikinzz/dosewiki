import {
  appendFormalCitationResult,
  createFormalCitationArtifacts,
  isCompletedFormalCitationSectionStatus,
  loadFormalCitationProgress,
  loadFormalCitationSectionArtifact,
  saveFormalCitationProgress,
  updateFormalCitationSectionProgress,
  writeFormalCitationMergedDraftArtifact,
  writeFormalCitationSectionArtifacts,
  writeFormalCitationSummaryArtifact,
} from "./formal-citations-artifacts.mjs";
import { assertValidatedFormalCitationSectionResult } from "./formal-citations-contract.mjs";
import { buildFormalCitationTargets } from "./formal-citations-targets.mjs";

function nowIso() {
  return new Date().toISOString();
}

function summarizeFormalCitationSectionResult(result, status = "validated") {
  const statusCounts = (result.claims ?? []).reduce((counts, claim) => {
    counts[claim.status] = (counts[claim.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    section: result.sectionKey,
    status,
    targets: result.targets?.length ?? 0,
    supported: statusCounts.supported ?? 0,
    needsReview: statusCounts.needs_review ?? 0,
    needsSource: statusCounts.needs_source ?? 0,
    finishReason: result.finishReason ?? null,
    promptTokens: result.usage?.promptTokens ?? 0,
    completionTokens: result.usage?.completionTokens ?? 0,
    totalTokens: result.usage?.totalTokens ?? 0,
    diagnostics: result.validationSummary?.diagnosticCount ?? 0,
    downgradedClaims: result.validationSummary?.downgradedClaimCount ?? 0,
  };
}

function validateFormalCitationSectionResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Section result was not an object");
  }
  if (!result.sectionKey || typeof result.sectionKey !== "string") {
    throw new Error("Section result is missing a valid sectionKey");
  }
  if (!Array.isArray(result.targets)) {
    throw new Error(`Section result ${result.sectionKey} is missing targets`);
  }
  if (!Array.isArray(result.claims)) {
    throw new Error(`Section result ${result.sectionKey} is missing claims`);
  }
  if (!Array.isArray(result.diagnostics)) {
    throw new Error(`Section result ${result.sectionKey} is missing diagnostics`);
  }
  if (!result.validationSummary || typeof result.validationSummary !== "object") {
    throw new Error(`Section result ${result.sectionKey} is missing validationSummary`);
  }

  const validated = assertValidatedFormalCitationSectionResult({
    schemaVersion: result.schemaVersion,
    sectionKey: result.sectionKey,
    summary: result.summary ?? "",
    notes: result.notes ?? [],
    claims: result.claims,
    diagnostics: result.diagnostics,
    validationSummary: result.validationSummary,
  });

  const targetKeys = new Set(result.targets.map((target) => target.claimKey));
  if (validated.claims.length !== result.targets.length) {
    throw new Error(`Section result ${result.sectionKey} did not return a validated decision for every target`);
  }
  for (const claim of validated.claims) {
    if (!targetKeys.has(claim.claimKey)) {
      throw new Error(`Section result ${result.sectionKey} contains an unknown claimKey`);
    }
  }

  return {
    ...result,
    ...validated,
  };
}

function createResumeOutcome(sectionKey, artifact) {
  return {
    sectionKey,
    status: "resumed",
    result: artifact?.result ?? null,
    reason: artifact?.reason ?? null,
  };
}

function resolveFormalCitationSectionWork({
  sections,
  progress,
  artifacts,
  resume = true,
}) {
  const plan = [];

  for (const sectionKey of sections) {
    const sectionState = progress?.sections?.[sectionKey];
    const sectionArtifact = resume
      ? loadFormalCitationSectionArtifact(artifacts, sectionKey)
      : null;
    const resumableResult = sectionArtifact?.result
      ? canResumeFormalCitationSectionResult(sectionArtifact.result)
      : false;

    if (
      resume &&
      sectionState &&
      isCompletedFormalCitationSectionStatus(sectionState.status) &&
      (
        (sectionState.status === "skipped" && sectionArtifact?.status === "skipped") ||
        (sectionState.status !== "skipped" && resumableResult)
      )
    ) {
      plan.push({
        sectionKey,
        action: "resume",
        artifact: sectionArtifact,
      });
      continue;
    }

    plan.push({
      sectionKey,
      action: "run",
      artifact: null,
    });
  }

  return plan;
}

function canResumeFormalCitationSectionResult(result) {
  try {
    validateFormalCitationSectionResult(result);
    return true;
  } catch {
    return false;
  }
}

export async function runFormalCitationWorkflow({
  article,
  articleSources,
  existingEvidence = [],
  sections,
  options,
  sourceUrl,
  targetUrl = null,
  artifactsDir = null,
  runSection,
  mergeDraft,
  log = console.log,
}) {
  const artifacts = createFormalCitationArtifacts({
    slug: article.slug,
    artifactsDir: artifactsDir || options?.artifactsDir,
  });
  const progress = loadFormalCitationProgress({
    artifacts,
    slug: article.slug,
    sections,
    sourceUrl,
    targetUrl,
    options,
  });
  const workPlan = resolveFormalCitationSectionWork({
    sections,
    progress,
    artifacts,
    resume: options?.resume !== false,
  });
  const validatedSectionResults = [];
  const sectionOutcomes = [];
  const failedSections = [];
  const skippedSections = [];
  const resumedSections = [];

  progress.status = "running";
  progress.updatedAt = nowIso();
  saveFormalCitationProgress(artifacts, progress);

  for (const item of workPlan) {
    const { sectionKey } = item;

    if (item.action === "resume") {
      const resumed = createResumeOutcome(sectionKey, item.artifact);
      sectionOutcomes.push(resumed);

      if (item.artifact?.status === "skipped") {
        skippedSections.push({ sectionKey, reason: item.artifact.reason ?? "Previously skipped" });
      } else if (item.artifact?.result) {
        validatedSectionResults.push(validateFormalCitationSectionResult(item.artifact.result));
        resumedSections.push(sectionKey);
      }

      appendFormalCitationResult(artifacts, {
        recordedAt: nowIso(),
        section: sectionKey,
        status: resumed.status,
        artifactStatus: item.artifact?.status ?? null,
      });
      log(`Resuming section artifact: ${sectionKey}`);
      continue;
    }

    const targets = buildFormalCitationTargets({ article, sectionKey });
    if (targets.length === 0) {
      const { sectionPaths } = writeFormalCitationSectionArtifacts({
        artifacts,
        sectionKey,
        status: "skipped",
        reason: "No citable targets were found for this section.",
      });
      updateFormalCitationSectionProgress({
        progress,
        sectionKey,
        patch: {
          status: "skipped",
          completedAt: nowIso(),
          resultPath: sectionPaths.resultPath,
        },
      });
      skippedSections.push({ sectionKey, reason: "No citable targets were found for this section." });
      sectionOutcomes.push({
        sectionKey,
        status: "skipped",
        reason: "No citable targets were found for this section.",
      });
      appendFormalCitationResult(artifacts, {
        recordedAt: nowIso(),
        section: sectionKey,
        status: "skipped",
        reason: "No citable targets were found for this section.",
      });
      saveFormalCitationProgress(artifacts, progress);
      continue;
    }

    const attempts = (progress.sections?.[sectionKey]?.attempts ?? 0) + 1;
    updateFormalCitationSectionProgress({
      progress,
      sectionKey,
      patch: {
        status: "running",
        startedAt: nowIso(),
        attempts,
      },
    });
    saveFormalCitationProgress(artifacts, progress);

    try {
      const result = validateFormalCitationSectionResult(await runSection(sectionKey));
      const { sectionPaths } = writeFormalCitationSectionArtifacts({
        artifacts,
        sectionKey,
        status: "validated",
        result,
      });
      updateFormalCitationSectionProgress({
        progress,
        sectionKey,
        patch: {
          status: "validated",
          completedAt: nowIso(),
          resultPath: sectionPaths.resultPath,
          promptPath: sectionPaths.promptPath,
          userMessagePath: sectionPaths.userMessagePath,
          sourcePacketPath: sectionPaths.sourcePacketPath,
          rawResponsePath: sectionPaths.rawResponsePath,
          usage: result.usage ?? null,
        },
      });
      saveFormalCitationProgress(artifacts, progress);

      validatedSectionResults.push(result);
      const summary = summarizeFormalCitationSectionResult(result);
      sectionOutcomes.push({
        sectionKey,
        status: "validated",
        summary,
      });
      appendFormalCitationResult(artifacts, {
        recordedAt: nowIso(),
        ...summary,
      });
      log(JSON.stringify(summary, null, 2));
      log("");
    } catch (error) {
      const { sectionPaths } = writeFormalCitationSectionArtifacts({
        artifacts,
        sectionKey,
        status: "failed",
        error,
      });
      updateFormalCitationSectionProgress({
        progress,
        sectionKey,
        patch: {
          status: "failed",
          failedAt: nowIso(),
          error: error.message ?? String(error),
          resultPath: sectionPaths.resultPath,
          rawResponsePath: sectionPaths.rawResponsePath,
        },
      });
      saveFormalCitationProgress(artifacts, progress);

      failedSections.push({ sectionKey, error: error.message ?? String(error) });
      sectionOutcomes.push({
        sectionKey,
        status: "failed",
        error: error.message ?? String(error),
      });
      appendFormalCitationResult(artifacts, {
        recordedAt: nowIso(),
        section: sectionKey,
        status: "failed",
        error: error.message ?? String(error),
      });
      log(`Section failed: ${sectionKey}`);
      log(error.message ?? String(error));
      log("");
    }
  }

  let draft = null;
  progress.currentSection = null;

  if (validatedSectionResults.length > 0) {
    progress.merge = {
      status: "running",
      updatedAt: nowIso(),
      mergedSections: [],
    };
    saveFormalCitationProgress(artifacts, progress);

    draft = mergeDraft({
      article,
      articleSources,
      existingEvidence,
      sectionResults: validatedSectionResults,
    });

    writeFormalCitationMergedDraftArtifact({
      artifacts,
      draft,
      validatedSections: validatedSectionResults.map((result) => result.sectionKey),
    });

    for (const result of validatedSectionResults) {
      updateFormalCitationSectionProgress({
        progress,
        sectionKey: result.sectionKey,
        patch: {
          status: "merged",
          mergedAt: nowIso(),
        },
      });
    }
    progress.merge = {
      status: "completed",
      updatedAt: nowIso(),
      mergedSections: validatedSectionResults.map((result) => result.sectionKey),
    };
  }

  progress.status = failedSections.length > 0 ? "completed_with_failures" : "completed";
  progress.updatedAt = nowIso();
  saveFormalCitationProgress(artifacts, progress);

  const summary = {
    runId: progress.runId,
    slug: article.slug,
    status: progress.status,
    recordedAt: nowIso(),
    selectedSections: [...sections],
    resumedSections,
    failedSections,
    skippedSections,
    validatedSections: validatedSectionResults.map((result) => result.sectionKey),
    outcomes: sectionOutcomes,
    draftSummary: draft
      ? {
        changedFields: draft.changes.length,
        references: draft.references.length,
        evidenceRows: draft.evidence.length,
        gaps: draft.gaps.length,
        preservedApproved: draft.preservedApproved.length,
        newSupport: draft.newSupport.length,
        proposedReplacements: draft.proposedReplacements.length,
        staleEvidence: draft.staleEvidence.length,
        staleReferences: draft.staleReferences.length,
      }
      : null,
    artifacts: {
      rootDir: artifacts.rootDir,
      progressPath: artifacts.progressPath,
      resultsPath: artifacts.resultsPath,
      summaryPath: artifacts.summaryPath,
      mergedDraftPath: artifacts.mergedDraftPath,
    },
  };
  writeFormalCitationSummaryArtifact({ artifacts, summary });

  return {
    artifacts,
    progress,
    summary,
    draft,
    sectionOutcomes,
    validatedSectionResults,
    failedSections,
    skippedSections,
    resumedSections,
  };
}
