"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OclModuleLike } from "./renderMoleculeSvg";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import type { RdkitModuleLike } from "./stereoGuard";
import {
  buildTemplateApplicationPlan,
  type TemplateApplicationRdkitModule,
} from "./templateApplicationPlan";
import {
  buildTemplateApplyPayload,
  chunkTemplateApplyMembers,
  mapMembersToTemplatePlanInput,
  type ClassTemplateMemberOption,
  type CurrentTemplateDepiction,
  type TemplateApplyPreviewRow,
} from "./templateApplicationPayload";
import type { TemplateApplyServerResult } from "./TemplateApplyDialog";
import { stripDummyAtoms } from "./stripDummyAtoms";

const TEMPLATE_APPLY_API = "/api/dev/molecule-class-template/apply";

interface UseTemplateApplicationOptions {
  enabled: boolean;
  classKey: string | null;
  templateMolblock?: string;
  members: readonly ClassTemplateMemberOption[];
  /** RDKit drives the substructure alignment plan. */
  rdkit: RdkitModuleLike | null;
  /** OpenChemLib renders the before/after preview SVGs. */
  ocl: OclModuleLike | null;
}

/** Owns the preview/read/plan/apply lifecycle for the templates-mode dialog. */
export function useTemplateApplication({
  enabled,
  classKey,
  templateMolblock,
  members,
  rdkit,
  ocl,
}: UseTemplateApplicationOptions) {
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [rows, setRows] = useState<TemplateApplyPreviewRow[]>([]);
  const [includedSlugs, setIncludedSlugs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<TemplateApplyServerResult[] | null>(null);
  const previewRequestId = useRef(0);

  useEffect(() => {
    previewRequestId.current += 1;
    setOpen(false);
    setPreparing(false);
    setRows([]);
    setIncludedSlugs(new Set());
    setError(null);
    setApplying(false);
    setResults(null);
  }, [classKey, enabled]);

  const prepare = useCallback(async () => {
    if (!enabled || !classKey || !templateMolblock || !rdkit || !ocl) return;
    const requestId = ++previewRequestId.current;

    setOpen(true);
    setPreparing(true);
    setRows([]);
    setIncludedSlugs(new Set());
    setError(null);
    setResults(null);

    try {
      if (members.length === 0) return;

      const depictionBatches = await Promise.all(
        chunkTemplateApplyMembers(members).map(async (batch) => {
          const params = new URLSearchParams();
          for (const member of batch) params.append("slug", member.slug);
          const response = await fetch(`${TEMPLATE_APPLY_API}?${params.toString()}`);
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            depictions?: CurrentTemplateDepiction[];
          };
          if (!response.ok) {
            throw new Error(body.error ?? `Preview input load failed (${response.status})`);
          }
          return body.depictions ?? [];
        }),
      );
      if (previewRequestId.current !== requestId) return;
      const depictions = depictionBatches.flat();
      const { planMembers, missingMembers } = mapMembersToTemplatePlanInput(members, depictions);
      const plainTemplateMolblock = await stripDummyAtoms(templateMolblock);
      const plan = buildTemplateApplicationPlan(
        rdkit as unknown as TemplateApplicationRdkitModule,
        plainTemplateMolblock,
        planMembers,
      );
      const depictionBySlug = new Map(depictions.map((depiction) => [depiction.slug, depiction]));
      const planBySlug = new Map(plan.map((outcome) => [outcome.slug, outcome]));
      const missingSlugs = new Set(missingMembers.map((member) => member.slug));

      const nextRows = members.map<TemplateApplyPreviewRow>((member) => {
        const depiction = depictionBySlug.get(member.slug);
        if (!depiction || missingSlugs.has(member.slug)) {
          return {
            ...member,
            beforeSvg: null,
            outcome: "error",
            reason: "The current stored depiction is unavailable.",
          };
        }

        const beforeSvg = renderMoleculeSvg(ocl, depiction.molblock, undefined, depiction.boldBonds);
        const outcome = planBySlug.get(member.slug);
        if (!outcome) {
          return {
            ...member,
            beforeSvg,
            outcome: "error",
            reason: "No template plan outcome was produced.",
          };
        }
        if (outcome.outcome !== "aligned") {
          return { ...member, beforeSvg, ...outcome };
        }

        // Alignment preserves bond order, so the member's bold indices stay valid.
        const afterSvg = renderMoleculeSvg(ocl, outcome.molblock, undefined, depiction.boldBonds);
        if (!beforeSvg || !afterSvg) {
          return {
            ...member,
            beforeSvg,
            outcome: "error",
            reason: "The before/after depiction could not be rendered safely.",
          };
        }
        return {
          ...member,
          beforeSvg,
          outcome: "aligned",
          alignedMolblock: outcome.molblock,
          afterSvg,
          ...(outcome.relaxedBonds ? { relaxedBonds: true } : {}),
        };
      });

      setRows(nextRows);
      setIncludedSlugs(
        new Set(nextRows.filter((row) => row.outcome === "aligned").map((row) => row.slug)),
      );
    } catch (previewError) {
      if (previewRequestId.current === requestId) {
        setError(previewError instanceof Error ? previewError.message : String(previewError));
      }
    } finally {
      if (previewRequestId.current === requestId) setPreparing(false);
    }
  }, [classKey, enabled, members, ocl, rdkit, templateMolblock]);

  const toggle = useCallback((slug: string, included: boolean) => {
    setIncludedSlugs((current) => {
      const next = new Set(current);
      if (included) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }, []);

  const confirm = useCallback(async () => {
    if (!classKey) return;
    const payload = buildTemplateApplyPayload(classKey, rows, includedSlugs);
    if (payload.members.length === 0) return;

    setApplying(true);
    const allResults: TemplateApplyServerResult[] = [];
    for (const batch of chunkTemplateApplyMembers(payload.members)) {
      try {
        const response = await fetch(TEMPLATE_APPLY_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classKey: payload.classKey, members: batch }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          results?: TemplateApplyServerResult[];
        };
        if (!response.ok) {
          throw new Error(body.error ?? `Template apply failed (${response.status})`);
        }
        allResults.push(...(body.results ?? []));
      } catch (applyError) {
        const reason = applyError instanceof Error ? applyError.message : String(applyError);
        allResults.push(
          ...batch.map((member) => ({ slug: member.slug, status: "error" as const, reason })),
        );
      }
    }
    setResults(allResults);
    setApplying(false);
  }, [classKey, includedSlugs, rows]);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && applying) return;
      if (!nextOpen) previewRequestId.current += 1;
      setOpen(nextOpen);
    },
    [applying],
  );

  return {
    open,
    preparing,
    rows,
    includedSlugs,
    error,
    applying,
    results,
    prepare,
    toggle,
    confirm,
    onOpenChange,
  };
}
