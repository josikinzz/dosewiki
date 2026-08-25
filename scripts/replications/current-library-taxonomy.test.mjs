import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  detectTitleClassMentions,
  detectTitleDrugs,
  figureContentTags,
  inferViewingMode,
} from "./build-current-library-taxonomy.mjs";
import {
  priorLedgerOwnsRow,
  selectCanary,
} from "./import-current-library-taxonomy.mjs";
import { mergeReviewResults } from "./merge-current-library-review-results.mjs";
import { applySourceReplicationContext } from "./reconcile-current-library-context.mjs";

describe("current library taxonomy", () => {
  it("keeps the longest explicit drug match without double-tagging DMT", () => {
    expect(detectTitleDrugs("5-MeO-DMT breakthrough")).toEqual([
      {
        slug: "5-meo-dmt",
        name: "5-MeO-DMT",
        class: "psychedelics",
        matched_title_text: "5-MeO-DMT",
      },
    ]);
  });

  it("derives only explicit title drugs and generic classes", () => {
    expect(detectTitleDrugs("Benadryl spiders and MXE tunnel").map((drug) => drug.slug)).toEqual([
      "diphenhydramine",
      "methoxetamine",
    ]);
    expect(detectTitleClassMentions("Delirium replication")).toEqual([
      { class: "deliriants", matched_title_text: "Delirium" },
    ]);
    expect(detectTitleDrugs("A purple forest")).toEqual([]);
  });

  it("prefers explicit viewing labels and review-flags rationale inferences", () => {
    expect(inferViewingMode({ title: "DPH CEVs" }).mode).toBe("closed-eye");
    expect(
      inferViewingMode({
        title: "Bedroom spiders",
        rationale: "The bedroom wall remains visible behind external spiders.",
      }),
    ).toMatchObject({ mode: "open-eye", confidence: "medium", reviewRequired: true });
  });

  it("assigns controlled explanatory figure subtypes", () => {
    expect(figureContentTags({ title: "EEG spike-and-wave" })).toEqual(["medical-trace"]);
    expect(figureContentTags({ title: "Dissociative Hole" })).toEqual(["teaching-slide"]);
  });

  it("keeps contextual effect examples and psychedelic art in the replication gallery", () => {
    const illustrative = applySourceReplicationContext(
      {
        replicationStatus: "not-replication",
        replicationStatusRationale: "It looks like an ordinary photograph in isolation.",
        contentFamily: "effect-illustration",
        contentTags: ["pareidolia-example"],
        decisionBasis: "current-item-visual-review",
      },
      { role: "replication", effect_slug: "increased-pareidolia" },
    );
    expect(illustrative).toMatchObject({
      replicationStatus: "replication",
      viewingMode: "open-eye",
      viewingModeTags: ["open-eye"],
      decisionBasis: "source-replication-context",
      taxonomyReviewRequired: false,
      contextReconciliation: {
        previousReplicationStatus: "not-replication",
        sourceRole: "replication",
        sourceEffectSlug: "increased-pareidolia",
      },
    });

    const visionary = applySourceReplicationContext(
      {
        replicationStatus: "unclear",
        replicationStatusRationale: "The work may be standalone visionary art.",
        contentFamily: "visionary-psychedelic-art",
        contentTags: ["visionary-art"],
        contentFamilyReviewRequired: true,
        decisionBasis: "current-item-tertiary-adjudication",
      },
      { effect_slug: "autonomous-entity" },
    );
    expect(visionary).toMatchObject({
      replicationStatus: "replication",
      viewingMode: "closed-eye",
      viewingModeTags: ["closed-eye"],
      taxonomyReviewRequired: true,
    });
  });

  it("does not turn explicit figures into replications merely because they have effect context", () => {
    const row = {
      replicationStatus: "not-replication",
      contentFamily: "explanatory-figure",
      decisionBasis: "explicit-figure-role",
    };
    expect(
      applySourceReplicationContext(row, {
        role: "figure",
        effect_slug: "increased-heart-rate",
      }),
    ).toBe(row);
  });

  it("selects diverse, de-duplicated row and artist canaries", () => {
    const row = (id, taxonomy) => ({ id, taxonomy });
    const selected = selectCanary(
      [
        row("figure", { replication_status: "not-replication", content_family: "explanatory-figure", drug_classes: [] }),
        row("open", { replication_status: "replication", viewing_mode: "open-eye", content_family: "experiential-replication", drug_classes: ["psychedelics"] }),
        row("unknown", { replication_status: "unclear", content_family: "uncertain", drug_classes: [] }),
      ],
      [
        { key: "rep", primary_type: "replicator" },
        { key: "other", primary_type: "other" },
      ],
    );
    expect(new Set(selected.rows.map((item) => item.id)).size).toBe(selected.rows.length);
    expect(selected.rows.map((item) => item.id)).toEqual(expect.arrayContaining(["figure", "open", "unknown"]));
    expect(selected.artists.map((item) => item.key)).toEqual(["rep", "other"]);
  });

  it("accepts a live taxonomy digest only when the previous campaign ledger verified that exact row", () => {
    const priorLedger = {
      taxonomySourceDigest: "prior-digest",
      rows: {
        "catalog:one": {
          productionId: "row-1",
          verified: true,
        },
      },
    };
    const source = { productionId: "row-1", taxonomyRecordKey: "catalog:one" };
    expect(priorLedgerOwnsRow(priorLedger, source, "prior-digest")).toBe(true);
    expect(priorLedgerOwnsRow(priorLedger, source, "foreign-digest")).toBe(false);
    expect(
      priorLedgerOwnsRow(
        {
          ...priorLedger,
          rows: { "catalog:one": { productionId: "row-1", verified: false } },
        },
        source,
        "prior-digest",
      ),
    ).toBe(false);
  });

  it("merges an exact visual-review campaign and eliminates unreviewed rows", () => {
    const root = mkdtempSync(join(tmpdir(), "dosewiki-taxonomy-review-"));
    const assignmentPath = join(root, "assignment.json");
    const completedPath = join(root, "completed.json");
    const indexPath = join(root, "index.json");
    const manifestPath = join(root, "manifest.json");
    const row = {
      productionId: "row-1",
      expected: { slug: "one" },
      replicationStatus: "unreviewed",
      titleDrugs: [],
      drugClasses: [],
      contentFamily: "uncertain",
      taxonomyReviewRequired: true,
    };
    writeFileSync(
      manifestPath,
      JSON.stringify({
        snapshotDigest: "snapshot",
        sources: {},
        policy: { precedence: [] },
        artists: [{ primaryType: "uncertain" }],
        rows: [row],
      }),
    );
    writeFileSync(
      assignmentPath,
      JSON.stringify({
        assignmentId: "review-1",
        outputPath: completedPath,
        items: [{ productionId: "row-1" }],
      }),
    );
    writeFileSync(
      completedPath,
      JSON.stringify({
        schemaVersion: 1,
        assignmentId: "review-1",
        items: [{
          productionId: "row-1",
          replicationStatus: "replication",
          replicationStatusConfidence: "high",
          replicationStatusRationale: "A photographed room remains visible beneath drifting overlays.",
          viewingMode: "open-eye",
          viewingModeConfidence: "high",
          viewingModeRationale: "The room is the persistent external-world substrate.",
          contentFamily: "experiential-replication",
          contentTags: ["environmental-distortion"],
          contentFamilyConfidence: "high",
          contentFamilyRationale: "It directly recreates an altered external visual field.",
          reviewRequired: false,
          evidenceInspected: ["image"],
        }],
      }),
    );
    writeFileSync(
      indexPath,
      JSON.stringify({
        snapshotDigest: "snapshot",
        scope: { unreviewedRows: 1 },
        assignments: ["assignment.json"],
      }),
    );

    const merged = mergeReviewResults({
      baseManifestPath: manifestPath,
      assignmentIndexPath: indexPath,
    });
    expect(merged.summary.replicationStatus).toEqual({ replication: 1 });
    expect(merged.rows[0]).toMatchObject({
      replicationStatus: "replication",
      viewingMode: "open-eye",
      viewingModeTags: ["open-eye"],
      decisionBasis: "current-item-visual-review",
      taxonomyReviewRequired: false,
    });
  });
});
