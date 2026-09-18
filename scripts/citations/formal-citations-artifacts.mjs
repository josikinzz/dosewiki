import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { postgresFingerprintFromUrl } from "../lib/data-client.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");

const DEFAULT_FORMAL_CITATIONS_ARTIFACTS_DIR = join(
  PROJECT_ROOT,
  "notes-and-plans/exports/formal-citations",
);

function sanitizePathSegment(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function nowIso() {
  return new Date().toISOString();
}

export function isCompletedFormalCitationSectionStatus(status) {
  return status === "validated" || status === "merged" || status === "skipped";
}

export function createFormalCitationArtifacts({
  slug,
  artifactsDir = DEFAULT_FORMAL_CITATIONS_ARTIFACTS_DIR,
}) {
  const scopedSlug = sanitizePathSegment(slug);
  const rootDir = join(artifactsDir, scopedSlug);
  const sectionsDir = join(rootDir, "sections");
  const promptsDir = join(rootDir, "prompts");
  const sourcePacketsDir = join(rootDir, "source-packets");
  const rawResponsesDir = join(rootDir, "raw-responses");

  return {
    runId: `formal-citations-${scopedSlug}-${nowIso().replace(/[:.]/g, "-")}`,
    rootDir,
    sectionsDir,
    promptsDir,
    sourcePacketsDir,
    rawResponsesDir,
    progressPath: join(rootDir, "progress.json"),
    resultsPath: join(rootDir, "results.jsonl"),
    summaryPath: join(rootDir, "summary.json"),
    mergedDraftPath: join(rootDir, "merged-draft.json"),
    writeResultPath: join(rootDir, "write-result.json"),
    getSectionPaths(sectionKey) {
      const scopedSection = sanitizePathSegment(sectionKey);
      return {
        resultPath: join(sectionsDir, `${scopedSection}.json`),
        promptPath: join(promptsDir, `${scopedSection}.system-prompt.txt`),
        userMessagePath: join(promptsDir, `${scopedSection}.user-message.txt`),
        sourcePacketPath: join(sourcePacketsDir, `${scopedSection}.json`),
        rawResponsePath: join(rawResponsesDir, `${scopedSection}.txt`),
      };
    },
  };
}

function ensureFormalCitationArtifactDirs(artifacts) {
  for (const dir of [
    artifacts?.rootDir,
    artifacts?.sectionsDir,
    artifacts?.promptsDir,
    artifacts?.sourcePacketsDir,
    artifacts?.rawResponsesDir,
  ]) {
    if (dir) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

function createPendingSectionState(sectionKey) {
  return {
    sectionKey,
    status: "pending",
    updatedAt: nowIso(),
    attempts: 0,
    resultPath: null,
    sourcePacketPath: null,
    promptPath: null,
    userMessagePath: null,
    rawResponsePath: null,
  };
}

function createFormalCitationProgress({
  artifacts,
  slug,
  sections,
  sourceUrl,
  targetUrl = null,
  options,
}) {
  return {
    runId: artifacts.runId,
    slug,
    status: "starting",
    startedAt: nowIso(),
    updatedAt: nowIso(),
    sourceDeployment: postgresFingerprintFromUrl(sourceUrl),
    targetDeployment: postgresFingerprintFromUrl(targetUrl),
    selectedSections: [...sections],
    currentSection: null,
    resultsPath: artifacts.resultsPath,
    mergedDraftPath: artifacts.mergedDraftPath,
    summaryPath: artifacts.summaryPath,
    writeResultPath: artifacts.writeResultPath,
    options: {
      write: Boolean(options?.write),
      approvedWriteMode: options?.approvedWriteMode ?? "preserve",
      refreshApproved: Boolean(options?.refreshApproved),
      replaceApproved: Boolean(options?.replaceApproved),
      model: options?.model ?? null,
      reasoningEffort: options?.reasoningEffort ?? null,
      disableReasoning: Boolean(options?.disableReasoning),
      resume: Boolean(options?.resume),
      artifactsDir: artifacts.rootDir,
      wikipediaEnrichment: options?.wikipediaEnrichment !== false,
    },
    sections: Object.fromEntries(
      sections.map((sectionKey) => [sectionKey, createPendingSectionState(sectionKey)]),
    ),
    merge: {
      status: "pending",
      updatedAt: nowIso(),
      mergedSections: [],
    },
  };
}

export function saveFormalCitationProgress(artifacts, progress) {
  if (!artifacts?.progressPath) return;
  ensureFormalCitationArtifactDirs(artifacts);
  writeFileSync(artifacts.progressPath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
}

export function loadFormalCitationProgress({
  artifacts,
  slug,
  sections,
  sourceUrl,
  targetUrl = null,
  options,
}) {
  ensureFormalCitationArtifactDirs(artifacts);

  if (!options?.resume || !existsSync(artifacts.progressPath)) {
    const freshProgress = createFormalCitationProgress({
      artifacts,
      slug,
      sections,
      sourceUrl,
      targetUrl,
      options,
    });
    writeFileSync(artifacts.resultsPath, "", "utf8");
    saveFormalCitationProgress(artifacts, freshProgress);
    return freshProgress;
  }

  const resumed = JSON.parse(readFileSync(artifacts.progressPath, "utf8"));
  delete resumed.sourceUrl;
  delete resumed.targetUrl;
  const nextProgress = {
    ...createFormalCitationProgress({
      artifacts,
      slug,
      sections,
      sourceUrl,
      targetUrl,
      options,
    }),
    ...resumed,
    runId: artifacts.runId,
    slug,
    updatedAt: nowIso(),
    sourceDeployment: postgresFingerprintFromUrl(sourceUrl),
    targetDeployment: postgresFingerprintFromUrl(targetUrl),
    selectedSections: [...sections],
    resultsPath: artifacts.resultsPath,
    mergedDraftPath: artifacts.mergedDraftPath,
    summaryPath: artifacts.summaryPath,
    writeResultPath: artifacts.writeResultPath,
    options: {
      ...resumed.options,
      write: Boolean(options?.write),
      approvedWriteMode: options?.approvedWriteMode ?? "preserve",
      refreshApproved: Boolean(options?.refreshApproved),
      replaceApproved: Boolean(options?.replaceApproved),
      model: options?.model ?? null,
      reasoningEffort: options?.reasoningEffort ?? null,
      disableReasoning: Boolean(options?.disableReasoning),
      resume: Boolean(options?.resume),
      artifactsDir: artifacts.rootDir,
      wikipediaEnrichment: options?.wikipediaEnrichment !== false,
    },
    merge: {
      status: resumed?.merge?.status ?? "pending",
      updatedAt: nowIso(),
      mergedSections: Array.isArray(resumed?.merge?.mergedSections)
        ? resumed.merge.mergedSections
        : [],
    },
  };

  const sectionStates = { ...(resumed?.sections ?? {}) };
  for (const sectionKey of sections) {
    if (!sectionStates[sectionKey]) {
      sectionStates[sectionKey] = createPendingSectionState(sectionKey);
    }
  }
  nextProgress.sections = sectionStates;
  saveFormalCitationProgress(artifacts, nextProgress);
  return nextProgress;
}

export function appendFormalCitationResult(artifacts, entry) {
  if (!artifacts?.resultsPath) return;
  ensureFormalCitationArtifactDirs(artifacts);
  appendFileSync(artifacts.resultsPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function updateFormalCitationSectionProgress({
  progress,
  sectionKey,
  patch,
}) {
  const prior = progress.sections?.[sectionKey] ?? createPendingSectionState(sectionKey);
  progress.sections = progress.sections ?? {};
  progress.sections[sectionKey] = {
    ...prior,
    ...patch,
    sectionKey,
    updatedAt: nowIso(),
  };
  progress.updatedAt = nowIso();
  progress.currentSection = patch?.status === "running" ? sectionKey : progress.currentSection;
  return progress.sections[sectionKey];
}

export function writeFormalCitationSectionArtifacts({
  artifacts,
  sectionKey,
  status,
  result = null,
  error = null,
  reason = null,
}) {
  ensureFormalCitationArtifactDirs(artifacts);
  const sectionPaths = artifacts.getSectionPaths(sectionKey);
  const payload = {
    sectionKey,
    status,
    recordedAt: nowIso(),
  };

  if (result) {
    if (result.systemPrompt) {
      writeFileSync(sectionPaths.promptPath, result.systemPrompt, "utf8");
    }
    if (result.userMessage) {
      writeFileSync(sectionPaths.userMessagePath, result.userMessage, "utf8");
    }
    if (result.sourcePacket) {
      writeFileSync(sectionPaths.sourcePacketPath, `${JSON.stringify(result.sourcePacket, null, 2)}\n`, "utf8");
    }
    if (typeof result.rawContent === "string") {
      writeFileSync(sectionPaths.rawResponsePath, result.rawContent, "utf8");
    }

    payload.result = {
      schemaVersion: result.schemaVersion,
      sectionKey: result.sectionKey,
      summary: result.summary,
      notes: result.notes,
      claims: result.claims,
      targets: result.targets,
      sourcePacket: result.sourcePacket ?? null,
      diagnostics: result.diagnostics ?? [],
      validationSummary: result.validationSummary ?? null,
      finishReason: result.finishReason ?? null,
      reasoning: result.reasoning ?? null,
      usage: result.usage ?? null,
    };
    payload.paths = sectionPaths;
  }

  if (error) {
    payload.error = {
      message: error.message ?? String(error),
    };
    if (typeof error.rawContent === "string" && error.rawContent.trim()) {
      writeFileSync(sectionPaths.rawResponsePath, error.rawContent, "utf8");
      payload.paths = {
        ...(payload.paths ?? {}),
        rawResponsePath: sectionPaths.rawResponsePath,
      };
    }
  }

  if (reason) {
    payload.reason = reason;
  }

  writeFileSync(sectionPaths.resultPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    payload,
    sectionPaths,
  };
}

export function loadFormalCitationSectionArtifact(artifacts, sectionKey) {
  const sectionPaths = artifacts.getSectionPaths(sectionKey);
  if (!existsSync(sectionPaths.resultPath)) {
    return null;
  }
  const artifact = JSON.parse(readFileSync(sectionPaths.resultPath, "utf8"));
  if (!artifact?.result?.sourcePacket && existsSync(sectionPaths.sourcePacketPath)) {
    artifact.result = artifact.result ?? {};
    artifact.result.sourcePacket = JSON.parse(readFileSync(sectionPaths.sourcePacketPath, "utf8"));
  }
  return artifact;
}

export function writeFormalCitationMergedDraftArtifact({
  artifacts,
  draft,
  validatedSections,
}) {
  ensureFormalCitationArtifactDirs(artifacts);
  const payload = {
    recordedAt: nowIso(),
    validatedSections,
    draft,
  };
  writeFileSync(artifacts.mergedDraftPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export function writeFormalCitationSummaryArtifact({
  artifacts,
  summary,
}) {
  ensureFormalCitationArtifactDirs(artifacts);
  writeFileSync(artifacts.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

export function writeFormalCitationWriteResultArtifact({
  artifacts,
  writeResult,
}) {
  ensureFormalCitationArtifactDirs(artifacts);
  writeFileSync(artifacts.writeResultPath, `${JSON.stringify(writeResult, null, 2)}\n`, "utf8");
}
