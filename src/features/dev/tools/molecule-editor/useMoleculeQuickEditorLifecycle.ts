import { useCallback, useEffect, useRef, useState } from "react";
import { useInvalidateEditorReads } from "@/hooks/useEditorRead";
import type { InchiComparison } from "./stereoGuard";
import { compareInchi } from "./stereoGuard";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import { smilesToMolblock } from "./smilesToMolblock";
import { useOcl } from "./useOcl";
import { useRdkit } from "./useRdkit";
import { useMoleculeSourceRead } from "./useMoleculeSourceRead";

interface MoleculeOverride {
  slug: string;
  molblock: string;
  svg: string;
  smiles?: string;
  boldBonds?: number[];
  source?: "seeded" | "editor" | "template";
  updatedAt: string;
  updatedBy?: string;
}

interface SaveResult {
  tone: "success" | "danger";
  message: string;
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
  const [overrideDoc, setOverrideDoc] = useState<MoleculeOverride | null | undefined>(undefined);
  const [overrideLoadError, setOverrideLoadError] = useState<string | null>(null);
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
    setOverrideLoadError(null);
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setOverrideDoc(undefined);
      setOverrideLoadError(null);
      return;
    }
    const slugChanged = loadedSlugRef.current !== slug;
    loadedSlugRef.current = slug;
    let cancelled = false;
    if (slugChanged) setOverrideDoc(undefined);
    setOverrideLoadError(null);
    void fetch(`${SAVE_API}?slug=${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          override?: MoleculeOverride | null;
        };
        if (!response.ok) {
          throw new Error(body.error ?? `Molecule load failed (${response.status})`);
        }
        if (!cancelled) setOverrideDoc(body.override ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOverrideDoc(null);
        setOverrideLoadError(error instanceof Error ? error.message : String(error));
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
    if (overrideDoc === undefined) {
      setComputing(true);
      return;
    }
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
  }, [slug, variant, overrideDoc, moleculeSource, smiles]);

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
    overrideDoc === undefined ||
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
  const canSave = dirty && !!edited && !!previewSvg && !saving && !noStructure && !renderBlocked;

  const save = useCallback(async () => {
    if (!slug || !edited || !ocl) return;
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
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Save failed (${response.status})`);
      setOverrideDoc({
        slug,
        molblock: edited,
        svg,
        ...(smiles ? { smiles } : {}),
        ...(boldBonds.length > 0 ? { boldBonds } : {}),
        source: "editor",
        updatedAt: new Date().toISOString(),
      });
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
  }, [slug, edited, ocl, smiles, boldBonds, invalidateEditorReads]);

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
    overrideLoadError,
    dirty,
    renderBlocked,
    canSave,
    loadedFromOverride: variant === "saved" && !!overrideDoc,
    save,
    applyRevert,
    revertToAuto,
  };
}
