"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ActionNoticeTone } from "@/features/dev/components";

import type { IncomingFile } from "./IncomingTray";
import {
  buildReplicationSlug,
  fileFormat,
  inferMediaType,
  titleFromFileName,
  type StudioRow,
} from "./replicationStudioModel";

const CORPUS_API = "/api/dev/replications";
const UPLOAD_URL_API = "/api/dev/replications/upload-url";

type Feedback = { tone: ActionNoticeTone; message: string };

type IncomingControllerOptions = {
  rows: readonly StudioRow[];
  loadCorpus: () => Promise<void>;
  setFeedback: (feedback: Feedback | null) => void;
  readError: (response: Response, fallback: string) => Promise<string>;
};

export function useReplicationIncoming({
  rows,
  loadCorpus,
  setFeedback,
  readError,
}: IncomingControllerOptions) {
  const [incoming, setIncoming] = useState<IncomingFile[]>([]);
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

  const addFiles = useCallback((fileList: FileList | null) => {
    const files = [...(fileList ?? [])];
    if (files.length === 0) return;
    setIncoming((current) => [
      ...current,
      ...files.map((file, index) => {
        const type = inferMediaType(file);
        const previewUrl = type === "audio" ? null : URL.createObjectURL(file);
        if (previewUrl) objectUrls.current.add(previewUrl);
        return {
          id: `incoming-${Date.now()}-${index}`,
          file,
          name: file.name,
          type,
          previewUrl,
          title: titleFromFileName(file.name),
          artist: "",
          effectSlug: "",
          effectTags: [],
          status: "draft" as const,
        };
      }),
    ]);
  }, []);

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

  const patchIncoming = useCallback((id: string, patch: Partial<IncomingFile>) => {
    setIncoming((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const addToLibrary = useCallback(
    async (item: IncomingFile) => {
      patchIncoming(item.id, { status: "uploading", error: undefined });
      try {
        const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await item.file.arrayBuffer()))]
          .map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
          return;
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
        // A previous identical upload may already own this immutable key.
        // The finish route verifies its bytes even when PUT returns 412.
        if (!uploadResponse.ok && uploadResponse.status !== 412) {
          patchIncoming(item.id, { status: "error", error: "R2 storage rejected the file." });
          return;
        }
        const slug = buildReplicationSlug(
          item.title,
          item.artist,
          rows.map((row) => row.slug),
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
            effectTags: item.effectTags,
            format: fileFormat(item.name),
            fileSize: item.file.size,
          }),
        });
        if (!createResponse.ok) {
          patchIncoming(item.id, {
            status: "error",
            error: await readError(createResponse, "Could not create the row."),
          });
          return;
        }
        discardIncoming(item.id);
        setFeedback({ tone: "success", message: `Added ${slug} to the library.` });
        await loadCorpus();
      } catch {
        patchIncoming(item.id, {
          status: "error",
          error: "Upload failed: the endpoint is unreachable.",
        });
      }
    },
    [discardIncoming, loadCorpus, patchIncoming, readError, rows, setFeedback],
  );

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

  return {
    incoming,
    dragging,
    fileInputRef,
    addFiles,
    discardIncoming,
    clearIncoming,
    patchIncoming,
    addToLibrary,
  };
}
