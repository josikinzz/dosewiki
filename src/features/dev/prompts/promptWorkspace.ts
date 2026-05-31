import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getPromptDescriptorByKey,
  type PromptDescriptor,
} from "@/data/config/promptRegistry";
import { useEditorDocument } from "@/features/dev/context/editorDocumentSession";
import { usePrompt } from "@/hooks/usePrompts";

export type PromptSaveStatus = "idle" | "saving" | "saved" | "error";

export type PromptWorkspaceAttribution = {
  source: "convex" | "seed" | "missing";
  updatedAt?: string;
  updatedBy?: string;
};

export type PromptPreviewPayload = {
  key: string;
  kind: PromptDescriptor["kind"];
  label: string;
  content: string;
  originalContent: string;
  hasChanges: boolean;
};

export type PromptWorkspaceSnapshot = {
  descriptor: PromptDescriptor;
  content: string;
  originalContent: string;
  hasChanges: boolean;
  isLoading: boolean;
  exists: boolean;
  saveStatus: PromptSaveStatus;
  saveError: string | null;
  attribution: PromptWorkspaceAttribution;
  previewPayload: PromptPreviewPayload;
};

export type PromptWorkspaceDocument = PromptWorkspaceSnapshot & {
  markSaved: () => void;
  setContent: (content: string) => void;
  reset: () => void;
  reload: () => void;
  save: (updatedBy?: string) => Promise<void>;
};

export function resolvePromptDescriptor(descriptorOrKey: PromptDescriptor | string): PromptDescriptor {
  if (typeof descriptorOrKey !== "string") {
    return descriptorOrKey;
  }

  const descriptor = getPromptDescriptorByKey(descriptorOrKey);
  if (!descriptor) {
    throw new Error(`Unknown prompt key: ${descriptorOrKey}`);
  }
  return descriptor;
}

export function buildPromptWorkspaceSnapshot(input: {
  descriptor: PromptDescriptor;
  content: string;
  originalContent: string;
  isLoading: boolean;
  exists: boolean;
  saveStatus: PromptSaveStatus;
  saveError: string | null;
  updatedAt?: string;
  updatedBy?: string;
}): PromptWorkspaceSnapshot {
  const hasChanges = input.content !== input.originalContent;
  const attribution: PromptWorkspaceAttribution = {
    source: input.exists ? "convex" : input.originalContent ? "seed" : "missing",
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
  };

  return {
    descriptor: input.descriptor,
    content: input.content,
    originalContent: input.originalContent,
    hasChanges,
    isLoading: input.isLoading,
    exists: input.exists,
    saveStatus: input.saveStatus,
    saveError: input.saveError,
    attribution,
    previewPayload: {
      key: input.descriptor.convexKey,
      kind: input.descriptor.kind,
      label: input.descriptor.label,
      content: input.content,
      originalContent: input.originalContent,
      hasChanges,
    },
  };
}

export function usePromptWorkspaceDocument(
  descriptorOrKey: PromptDescriptor | string,
  options: { seedContent?: string } = {},
): PromptWorkspaceDocument {
  const descriptor = useMemo(
    () => resolvePromptDescriptor(descriptorOrKey),
    [descriptorOrKey],
  );
  const runtimePrompt = usePrompt(descriptor.convexKey);
  const loadedOriginalContent = runtimePrompt.exists
    ? runtimePrompt.content ?? ""
    : options.seedContent ?? "";

  const [saveStatus, setSaveStatus] = useState<PromptSaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const document = useEditorDocument(loadedOriginalContent);
  const content = document.draft;
  const originalContent = document.original;

  useEffect(() => {
    if (saveStatus !== "saved") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setSaveStatus("idle"), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [saveStatus]);

  const setContent = useCallback((nextContent: string) => {
    document.replaceDraft(nextContent);
    setSaveStatus("idle");
    setSaveError(null);
  }, [document]);

  const reset = useCallback(() => {
    document.reset();
    setSaveStatus("idle");
    setSaveError(null);
  }, [document]);

  const reload = useCallback(() => {
    document.markSaved(loadedOriginalContent);
    setSaveStatus("idle");
    setSaveError(null);
  }, [document, loadedOriginalContent]);

  const save = useCallback(async (updatedBy?: string) => {
    if (content === originalContent) {
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    try {
      await runtimePrompt.save(content, updatedBy);
      document.markSaved(content);
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "Failed to save prompt.");
      throw error;
    }
  }, [content, document, originalContent, runtimePrompt]);

  const snapshot = buildPromptWorkspaceSnapshot({
    descriptor,
    content,
    originalContent,
    isLoading: runtimePrompt.isLoading,
    exists: runtimePrompt.exists,
    saveStatus,
    saveError,
    updatedAt: runtimePrompt.updatedAt,
    updatedBy: runtimePrompt.updatedBy,
  });

  return {
    ...snapshot,
    markSaved: document.markSaved,
    setContent,
    reset,
    reload,
    save,
  };
}
