import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ACTIONABLE_STATUS = new Set(["needs_review", "needs_source"]);
const MARKER_PATTERN = /\[cite:[^\]]+\]/g;

export function immutableRowKey({ slug, section }) {
  return `${slug}:${section}`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path) {
  return sha256(readFileSync(path));
}

function markerCount(value) {
  return (JSON.stringify(value ?? null).match(MARKER_PATTERN) ?? []).length;
}

function actionablePlanRows(plan) {
  return (plan.substances ?? []).flatMap((substance) => (
    (substance.sections ?? [])
      .filter((candidate) => candidate.status !== "deferred_sparse")
      .map((candidate) => ({
        slug: substance.slug,
        section: candidate.section,
      }))
  ));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function finalizedArtifacts(workbench, row) {
  const runPath = resolve(workbench, "runs", row.runId ?? "");
  const manifestPath = resolve(runPath, "pi-run-manifest.json");
  const draftPath = resolve(runPath, "citation-draft.json");
  const manifest = readJson(manifestPath);
  const draft = readJson(draftPath);
  const finalizedDraftSha256 = sha256File(draftPath);
  const finalReviewDraftSha256 = manifest.gates?.final_review_surface_scan?.snapshot?.draft;

  if (manifest.outcome !== "needs_review" || !manifest.finalizedAt) {
    throw new Error(`${row.slug}:${row.section} run ${row.runId} is not finalized at needs_review`);
  }
  if (!finalReviewDraftSha256 || finalReviewDraftSha256 !== finalizedDraftSha256) {
    throw new Error(`${row.slug}:${row.section} run ${row.runId} final-review draft hash does not match citation-draft.json`);
  }
  if (draft.article?.slug !== row.slug) {
    throw new Error(`${row.slug}:${row.section} run ${row.runId} has article slug drift`);
  }
  if (!Object.hasOwn(draft.markedSections ?? {}, row.section)) {
    throw new Error(`${row.slug}:${row.section} run ${row.runId} has no accepted marked section`);
  }

  return { draft, manifest, finalizedDraftSha256 };
}

function deriveCurrentRows({ plan, tracker, workbench }) {
  const errors = [];
  const trackerByKey = new Map();
  for (const row of tracker.items ?? []) {
    const key = immutableRowKey(row);
    if (trackerByKey.has(key)) errors.push(`duplicate tracker row ${key}`);
    trackerByKey.set(key, row);
  }

  const rows = [];
  for (const planRow of actionablePlanRows(plan)) {
    const key = immutableRowKey(planRow);
    const trackerRow = trackerByKey.get(key);
    if (!trackerRow) {
      errors.push(`missing tracker row ${key}`);
      continue;
    }
    if (!trackerRow.runId) {
      errors.push(`${key} has no current tracker runId`);
      continue;
    }
    try {
      const { draft, manifest, finalizedDraftSha256 } = finalizedArtifacts(workbench, trackerRow);
      const count = markerCount(draft.markedSections[planRow.section]);
      rows.push({
        key,
        slug: planRow.slug,
        section: planRow.section,
        runId: trackerRow.runId,
        status: count > 0 ? "needs_review" : "needs_source",
        markerCount: count,
        finalizedAt: manifest.finalizedAt,
        finalizedDraftSha256,
        finalReviewDraftSha256: manifest.gates.final_review_surface_scan.snapshot.draft,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { rows, errors };
}

function currentRowFields(row) {
  return {
    runId: row.runId,
    status: row.status,
    markerCount: row.markerCount,
    finalizedAt: row.finalizedAt,
    finalizedDraftSha256: row.finalizedDraftSha256,
  };
}

function sameCurrentRow(left, right) {
  return JSON.stringify(currentRowFields(left)) === JSON.stringify(currentRowFields(right));
}

export function reconcileSecondPassDerivedState({ plan, tracker, campaignState, workbench, immutablePlanSha256 }) {
  const projection = deriveCurrentRows({ plan, tracker, workbench });
  if (projection.errors.length > 0) {
    throw new Error(`Cannot derive current second-pass rows: ${projection.errors.join("; ")}`);
  }

  const currentRows = projection.rows;
  const currentByKey = new Map(currentRows.map((row) => [row.key, row]));
  const nextTracker = structuredClone(tracker);
  let trackerChanges = 0;
  for (const trackerRow of nextTracker.items ?? []) {
    const current = currentByKey.get(immutableRowKey(trackerRow));
    if (!current) continue;
    if (!sameCurrentRow(trackerRow, current)) {
      Object.assign(trackerRow, currentRowFields(current));
      trackerChanges += 1;
    }
  }

  const nextCampaignState = structuredClone(campaignState);
  const stateChanged = JSON.stringify(nextCampaignState.currentRows ?? []) !== JSON.stringify(currentRows)
    || nextCampaignState.immutablePlanSha256 !== immutablePlanSha256;
  if (stateChanged) {
    nextCampaignState.immutablePlanSha256 = immutablePlanSha256;
    nextCampaignState.currentRows = currentRows;
  }

  return {
    tracker: nextTracker,
    campaignState: nextCampaignState,
    currentRows,
    trackerChanges,
    stateChanged,
  };
}

export function validateStoredCurrentRows({ plan, tracker, campaignState, workbench, immutablePlanSha256 }) {
  const errors = [];
  const expected = deriveCurrentRows({ plan, tracker, workbench });
  errors.push(...expected.errors);
  const expectedRows = actionablePlanRows(plan);
  const storedRows = campaignState?.currentRows;
  if (!Array.isArray(storedRows)) {
    errors.push("campaign state must contain currentRows");
    return { errors, expectedRows: expected.rows };
  }
  if (campaignState.immutablePlanSha256 !== immutablePlanSha256) {
    errors.push("campaign state currentRows do not bind the immutable plan hash");
  }
  const storedByKey = new Map();
  for (const row of storedRows) {
    const key = row.key ?? immutableRowKey(row);
    if (storedByKey.has(key)) errors.push(`duplicate current campaign row ${key}`);
    storedByKey.set(key, row);
  }
  if (storedRows.length !== expectedRows.length) {
    errors.push(`campaign currentRows must contain ${expectedRows.length} actionable rows; found ${storedRows.length}`);
  }
  for (const expectedRow of expected.rows) {
    const stored = storedByKey.get(expectedRow.key);
    if (!stored) {
      errors.push(`missing current campaign row ${expectedRow.key}`);
      continue;
    }
    if (JSON.stringify(stored) !== JSON.stringify(expectedRow)) {
      errors.push(`current campaign row ${expectedRow.key} does not match its finalized artifact`);
    }
    const trackerRow = (tracker.items ?? []).find((row) => immutableRowKey(row) === expectedRow.key);
    if (!trackerRow || !sameCurrentRow(trackerRow, expectedRow)) {
      errors.push(`tracker row ${expectedRow.key} does not match current campaign row`);
    }
  }
  return { errors, expectedRows: expected.rows };
}

export { ACTIONABLE_STATUS, markerCount };
