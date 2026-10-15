"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUnsavedWork, type NoticeTone } from "@/features/dev/components";

import { incomingReady, type IncomingFile } from "./IncomingTray";
import {
  buildReplicationSlug,
  fileFormat,
  fileSha256,
  inferMediaType,
  isUnpublished,
  titleFromFileName,
  type StudioRow,
} from "./replicationStudioModel";

const CORPUS_API = "/api/dev/replications";
const UPLOAD_URL_API = "/api/dev/replications/upload-url";

type Feedback = { tone: NoticeTone; message: string };

type IncomingControllerOptions = {
  rows: readonly StudioRow[];
  loadCorpus: () => Promise<void>;
  setFeedback: (feedback: Feedback | null) => void;
  readError: (response: Response, fallback: string) => Promise<string>;
  onUploaded?: (slug: string) => void;
};

function readImageSize(url: string): Promise<{ width: number; height: number } | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(
      image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null,
    );
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function useReplicationIncoming({
  rows,
  loadCorpus,
  setFeedback,
  readError,
  onUploaded,
}: IncomingControllerOptions) {
  const [incoming, setIncoming] = useState<IncomingFile[]>([]);
  const [uploadedSlugs, setUploadedSlugs] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const objectUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const patchIncoming = useCallback((id: string, patch: Partial<IncomingFile>) => {
    setIncoming((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const addFiles = useCallback((fileList: FileList | null) => {
    const files = [...(fileList ?? [])];
    if (files.length === 0) return;
    const stamp = Date.now();
    const added = files.map((file, index): IncomingFile => {
      const type = inferMediaType(file);
      const previewUrl = type === "audio" ? null : URL.createObjectURL(file);
      if (previewUrl) objectUrls.current.add(previewUrl);
      return {
        id: `incoming-${stamp}-${index}`,
        file,
        name: file.name,
        type,
        previewUrl,
        title: titleFromFileName(file.name),
        artist: "",
        effectSlug: "",
        rightsStatus: "unknown",
        sourceUrl: "",
        creditLine: "",
        status: "draft",
      };
    });
    setIncoming((current) => [...current, ...added]);
    for (const item of added) {
      void fileSha256(item.file).then(
        (sha256) => patchIncoming(item.id, { sha256 }),
        () => patchIncoming(item.id, { sha256: null }),
      );
      if (item.type === "image" && item.previewUrl) {
        void readImageSize(item.previewUrl).then((size) => {
          if (size) patchIncoming(item.id, { size });
        });
      }
    }
  }, [patchIncoming]);

  const discardIncoming = useCallback((id: string) => {
    setIncoming((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        objectUrls.current.delete(item.previewUrl);
      }
      return current.filter((entry) => entry.id !== id);
    });
  }, []);

  const clearIncoming = useCallback(() => {
    setIncoming((current) => {
      for (const item of current) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
          objectUrls.current.delete(item.previewUrl);
        }
      }
      return [];
    });
  }, []);

  const duplicates = useMemo(() => {
    const bySha = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.source_sha256) continue;
      bySha.set(row.source_sha256, [...(bySha.get(row.source_sha256) ?? []), row.slug]);
    }
    const seen = new Map<string, string>();
    const result = new Map<string, string[]>();
    for (const item of incoming) {
      if (!item.sha256) continue;
      const matches = [...(bySha.get(item.sha256) ?? [])];
      const earlier = seen.get(item.sha256);
      if (earlier) matches.push(`${earlier} (also in this tray)`);
      else seen.set(item.sha256, item.name);
      if (matches.length > 0) result.set(item.id, matches);
    }
    return result;
  }, [incoming, rows]);

  const waiting = useMemo(
    () =>
      uploadedSlugs
        .map((slug) => rows.find((row) => row.slug === slug))
        .filter((row): row is StudioRow => Boolean(row && isUnpublished(row))),
    [rows, uploadedSlugs],
  );

  const addToLibrary = useCallback(
    async (item: IncomingFile, takenSlugs: readonly string[] = []): Promise<string | null> => {
      patchIncoming(item.id, { status: "uploading", error: undefined });
      try {
        const sha256 = item.sha256 ?? await fileSha256(item.file);
        const urlResponse = await fetch(UPLOAD_URL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha256, format: fileFormat(item.name), type: item.type, fileSize: item.file.size }),
        });
        if (!urlResponse.ok) {
          patchIncoming(item.id, {
            status: "error",
            error: await readError(urlResponse, "Could not start the upload."),
          });
          return null;
        }
        const { uploadUrl, uploadHeaders, uploadToken } = (await urlResponse.json()) as {
          uploadUrl: string;
          uploadHeaders: Record<string, string>;
          uploadToken: string;
        };
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: uploadHeaders,
          body: item.file,
        });
        if (!uploadResponse.ok && uploadResponse.status !== 412) {
          patchIncoming(item.id, { status: "error", error: "R2 storage rejected the file." });
          return null;
        }
        const slug = buildReplicationSlug(
          item.title,
          item.artist,
          [...rows.map((row) => row.slug), ...takenSlugs],
        );
        const createResponse = await fetch(CORPUS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            title: item.title.trim(),
            artist: item.artist.trim(),
            role: "replication",
            type: item.type,
            uploadToken,
            effectSlug: item.effectSlug,
            rightsStatus: item.rightsStatus,
            sourceUrl: item.sourceUrl.trim() || undefined,
            creditLine: item.creditLine.trim() || undefined,
            format: fileFormat(item.name),
            fileSize: item.file.size,
          }),
        });
        if (!createResponse.ok) {
          patchIncoming(item.id, {
            status: "error",
            error: await readError(createResponse, "Could not create the row."),
          });
          return null;
        }
        discardIncoming(item.id);
        setUploadedSlugs((current) => [...current.filter((entry) => entry !== slug), slug]);
        setFeedback({
          tone: "success",
          message: `Uploaded ${slug}. It stays unpublished until you publish it.`,
        });
        await loadCorpus();
        onUploaded?.(slug);
        return slug;
      } catch {
        patchIncoming(item.id, {
          status: "error",
          error: "Upload failed: the server could not be reached.",
        });
        return null;
      }
    },
    [discardIncoming, loadCorpus, onUploaded, patchIncoming, readError, rows, setFeedback],
  );

  const addAllToLibrary = useCallback(async () => {
    const uploaded: string[] = [];
    for (const item of incoming.filter(incomingReady)) {
      const slug = await addToLibrary(item, uploaded);
      if (slug) uploaded.push(slug);
    }
    if (uploaded.length > 1) {
      setFeedback({
        tone: "success",
        message: `Uploaded ${uploaded.length} works. They stay unpublished until you publish them.`,
      });
    }
  }, [addToLibrary, incoming, setFeedback]);

  const dismissWaiting = useCallback(() => setUploadedSlugs([]), []);

  useEffect(() => {
    const carriesFiles = (event: DragEvent) =>
      [...(event.dataTransfer?.types ?? [])].includes("Files");
    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const onDragLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(event.dataTransfer?.files ?? null);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  useUnsavedWork({
    kind: "discard-only",
    because: "Upload the files from Incoming before leaving.",
    id: "replications/incoming",
    tab: "replications",
    label: `Replications: ${incoming.length} ${incoming.length === 1 ? "file" : "files"} in the Incoming tray`,
    dirty: incoming.length > 0,
    discard: clearIncoming,
  });

  return {
    incoming,
    duplicates,
    waiting,
    dragging,
    fileInputRef,
    addFiles,
    discardIncoming,
    clearIncoming,
    patchIncoming,
    addToLibrary,
    addAllToLibrary,
    dismissWaiting,
  };
}
