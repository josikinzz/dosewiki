import { useCallback, useEffect, useRef, useState } from "react";
import { useInvalidateEditorReads } from "@/hooks/useEditorRead";
import type { InchiComparison } from "./stereoGuard";
import { compareInchi } from "./stereoGuard";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import { smilesToMolblock } from "./smilesToMolblock";
import { useOcl } from "./useOcl";
import { useRdkit } from "./useRdkit";
import { useMoleculeSourceRead } from "./useMoleculeSourceRead";
import {
  DEPICTION_LOADING,
  depictionLoaded,
  knownDepiction,
  readMoleculeOverride,
  settleDepictionRead,
  type DepictionRead,
} from "./moleculeEditorRequests";
import type { MoleculeOverride, SaveResult } from "./moleculeEditorTypes";

interface SaveResponse {
  error?: string;
  updatedAt: string;
  updatedBy?: string;
  conflict?: { updatedBy?: string | null };
}

const SAVE_API = "/api/dev/molecule-override";
const LOAD_TIMEOUT_MS = 8000;

export function useMoleculeQuickEditorLifecycle({ slug }: { slug: string }) {
  const { ocl, error: oclError } = useOcl();
  const { rdkit, error: rdkitError } = useRdkit();
  const [variant, setVariant] = useState<"saved" | "auto">("saved");
  const [source, setSource] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [boldBonds, setBoldBonds] = useState<number[]>([]);
  const [computing, setComputing] = useState(false);
  const [noStructure, setNoStructure] = useState(false);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [guard, setGuard] = useState<InchiComparison | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [overrideRead, setOverrideRead] = useState<DepictionRead<MoleculeOverride>>(DEPICTION_LOADING);
  const [refreshToken, setRefreshToken] = useState(0);
  const loadedSlugRef = useRef<string | null>(null);

  const moleculeSource = useMoleculeSourceRead(slug || null);
  const invalidateEditorReads = useInvalidateEditorReads();
  const smiles = moleculeSource?.smiles ?? "";

  useEffect(() => {
    setVariant("saved");
    setSaveResult(null);
    setCanvasError(null);
    setConfirmRevert(false);
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setOverrideRead(DEPICTION_LOADING);
      return;
    }
    const slugChanged = loadedSlugRef.current !== slug;
    loadedSlugRef.current = slug;
    let cancelled = false;
    if (slugChanged) setOverrideRead(DEPICTION_LOADING);
    void settleDepictionRead(readMoleculeOverride(slug)).then((next) => {
      if (!cancelled) setOverrideRead(next);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, refreshToken]);

  useEffect(() => {
    if (!slug) {
      setSource(null);
      setEdited(null);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    if (overrideRead.status === "loading") {
      setComputing(true);
      return;
    }
    if (overrideRead.status === "failed") {
      setSource(null);
      setEdited(null);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    const overrideDoc = overrideRead.value;
    if (variant === "saved" && overrideDoc) {
      setSource(overrideDoc.molblock);
      setEdited(overrideDoc.molblock);
      setBoldBonds(overrideDoc.boldBonds ?? []);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    if (moleculeSource === undefined) {
      setComputing(true);
      return;
    }
    if (!smiles) {
      setSource(null);
      setEdited(null);
      setNoStructure(true);
      setComputing(false);
      return;
    }
    let cancelled = false;
    setComputing(true);
    setBoldBonds([]);
    void smilesToMolblock(smiles).then((molblock) => {
      if (cancelled) return;
      if (molblock) {
        setSource(molblock);
        setEdited(molblock);
        setNoStructure(false);
      } else {
        setSource(null);
        setEdited(null);
        setNoStructure(true);
      }
      setComputing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, variant, overrideRead, moleculeSource, smiles]);

  useEffect(() => {
    if (!ocl || !edited) {
      setPreviewSvg(null);
      setGuard(null);
      return;
    }
    const id = setTimeout(() => {
      setPreviewSvg(renderMoleculeSvg(ocl, edited, undefined, boldBonds));
      setGuard(rdkit && smiles ? compareInchi(rdkit, smiles, edited) : null);
    }, 120);
    return () => clearTimeout(id);
  }, [ocl, rdkit, edited, smiles, boldBonds]);

  const dataPending =
    overrideRead.status === "loading" ||
    moleculeSource === undefined ||
    (!ocl && !oclError) ||
    (!rdkit && !rdkitError);
  useEffect(() => {
    if (!dataPending) {
      setLoadTimedOut(false);
      return;
    }
    const id = setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [dataPending]);

  useEffect(() => {
    if (saveResult?.tone !== "success") return;
    const id = setTimeout(() => setSaveResult(null), 6000);
    return () => clearTimeout(id);
  }, [saveResult]);

  const dirty = edited !== source;
  const renderBlocked = !!oclError || !!rdkitError || !!canvasError;
  const snapshotLoaded = overrideRead.status === "loaded";
  const canSave =
    snapshotLoaded && dirty && !!edited && !!previewSvg && !saving && !noStructure && !renderBlocked;

  const save = useCallback(async () => {
    if (!slug || !edited || !ocl || overrideRead.status !== "loaded") return;
    const expectedUpdatedAt = overrideRead.value?.updatedAt ?? null;
    setSaving(true);
    setSaveResult(null);
    const svg = renderMoleculeSvg(ocl, edited, undefined, boldBonds);
    if (!svg) {
      setSaving(false);
      setSaveResult({
        tone: "danger",
        message: "The edited structure couldn't be rendered, so nothing was saved.",
      });
      return;
    }
    setPreviewSvg(svg);
    try {
      const response = await fetch(SAVE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          molblock: edited,
          svg,
          smiles,
          ...(boldBonds.length > 0 ? { boldBonds } : {}),
          expectedUpdatedAt,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as SaveResponse;
      if (response.status === 409) {
        const who = body.conflict?.updatedBy || "Someone";
        setSaveResult({
          tone: "danger",
          kind: "conflict",
          title: "Someone saved first",
          message: `${who} saved this depiction after you opened it, so nothing was published. Your edit is still on the canvas. Load the latest version to see theirs before saving again; that drops your edit.`,
        });
        return;
      }
      if (!response.ok) throw new Error(body.error ?? `Save failed (${response.status})`);
      setOverrideRead(
        depictionLoaded({
          slug,
          molblock: edited,
          svg,
          ...(smiles ? { smiles } : {}),
          ...(boldBonds.length > 0 ? { boldBonds } : {}),
          source: "editor",
          updatedAt: body.updatedAt,
          ...(body.updatedBy ? { updatedBy: body.updatedBy } : {}),
        }),
      );
      setVariant("saved");
      setSaveResult({
        tone: "success",
        message: "Saved. This is now the live depiction. The substance page refreshes momentarily.",
      });
      setRefreshToken((token) => token + 1);
      void invalidateEditorReads(["moleculeOverrides:listSlugs", "moleculeOverrides:getBySlug", "moleculeOverrides:getMetadataBySlug"]);
    } catch (error) {
      setSaveResult({
        tone: "danger",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }, [slug, edited, ocl, overrideRead, smiles, boldBonds, invalidateEditorReads]);

  const reloadOverride = useCallback(() => {
    setSaveResult(null);
    setVariant("saved");
    setSource(null);
    setEdited(null);
    setOverrideRead(DEPICTION_LOADING);
    setRefreshToken((token) => token + 1);
  }, []);

  const applyRevert = useCallback(() => {
    setVariant("auto");
    setSaveResult(null);
    setConfirmRevert(false);
  }, []);
  const revertToAuto = useCallback(() => {
    if (dirty) {
      setConfirmRevert(true);
    } else {
      applyRevert();
    }
  }, [dirty, applyRevert]);

  return {
    ocl,
    oclError,
    rdkit,
    rdkitError,
    source,
    edited,
    setEdited,
    computing,
    noStructure,
    previewSvg,
    boldBonds,
    setBoldBonds,
    smiles,
    guard,
    saving,
    saveResult,
    dismissSaveResult: () => setSaveResult(null),
    canvasError,
    setCanvasError,
    confirmRevert,
    dismissRevert: () => setConfirmRevert(false),
    loadTimedOut,
    overrideRead,
    reloadOverride,
    dirty,
    renderBlocked,
    canSave,
    loadedFromOverride: variant === "saved" && !!knownDepiction(overrideRead),
    save,
    applyRevert,
    revertToAuto,
  };
}
