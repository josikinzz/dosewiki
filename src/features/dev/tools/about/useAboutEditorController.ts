"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";

import { useLibrary } from "@/data/SubstanceIndexProvider";
import { normalizeFounderKeys } from "@/data/content/about";
import type {
  EditorActionStatusState,
  EditorNoticeMessage,
} from "@/features/dev/components";
import { useEditorDocument } from "@/features/dev/context/editorDocumentSession";
import { buildTextChangelog } from "@/utils/data/changelog";
import { api } from "../../../../../convex/_generated/api";
import type { AboutCopyNotice } from "./aboutEditorUtils";

const API_PATH = "/api/dev/about";
const COPY_NOTICE_DURATION_MS = 2500;

type SaveState = EditorActionStatusState | "idle";

type AboutConfigSource = {
  aboutMarkdown?: string | null;
  aboutSubtitle?: string | null;
  founderProfileKeys?: string[] | null;
} | null | undefined;

export type AboutDocument = {
  markdown: string;
  subtitle: string;
  founderKeys: string[];
};

function toAboutDocument(aboutConfig: AboutConfigSource): AboutDocument {
  return {
    markdown: aboutConfig?.aboutMarkdown ?? "",
    subtitle: aboutConfig?.aboutSubtitle ?? "",
    founderKeys: aboutConfig?.founderProfileKeys ?? [],
  };
}

export interface AboutEditorController {
  /** False until the Convex About document has arrived. */
  isLoaded: boolean;
  draft: AboutDocument;
  original: AboutDocument;
  isDirty: boolean;
  saveState: SaveState;
  notice: EditorNoticeMessage | null;
  copyNotice: AboutCopyNotice | null;
  markdownDiff: string;
  subtitleDiff: string;
  subtitleHasChanges: boolean;
  placeholderValues: Record<string, string>;
  replaceMarkdown: (markdown: string) => void;
  replaceSubtitle: (subtitle: string) => void;
  resetMarkdown: () => void;
  resetSubtitle: () => void;
  resetFounderKeys: () => void;
  toggleFounderKey: (key: string) => void;
  copyMarkdown: () => void;
  copySubtitle: () => void;
  save: () => Promise<void>;
}

/**
 * The About editor's own session over the Convex `siteConfig` About document.
 *
 * About is the pinned first entry of the Writing tab and saves the way its
 * siblings do: one immediate `POST /api/dev/about` carrying the whole
 * document, after which the draft becomes the new baseline. It stages nothing
 * into the shell's commit panel and contributes nothing to the dataset
 * changelog.
 */
export function useAboutEditorController(): AboutEditorController {
  const aboutConfig = useQuery(api.siteConfig.getAbout, {});
  const document = useEditorDocument(toAboutDocument(aboutConfig));
  const { chemicalClassIndexGroups, dosageCategoryGroups, mechanismIndexGroups, substanceRecords } =
    useLibrary();

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [copyNotice, setCopyNotice] = useState<AboutCopyNotice | null>(null);
  const copyNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { draft, original, isDirty, applyDraftTransform, applyHydration } = document;

  const markdownChangelog = useMemo(
    () => buildTextChangelog("About copy", original.markdown, draft.markdown),
    [draft.markdown, original.markdown],
  );
  const subtitleChangelog = useMemo(
    () => buildTextChangelog("About subtitle", original.subtitle, draft.subtitle),
    [draft.subtitle, original.subtitle],
  );

  const placeholderValues = useMemo(
    () => ({
      compoundCount: substanceRecords.length.toLocaleString(),
      psychoactiveClassCount: dosageCategoryGroups.length.toLocaleString(),
      categoryCount: dosageCategoryGroups.length.toLocaleString(),
      chemicalClassCount: chemicalClassIndexGroups.length.toLocaleString(),
      mechanismClassCount: mechanismIndexGroups.length.toLocaleString(),
      mechanismOfActionClassCount: mechanismIndexGroups.length.toLocaleString(),
      // The dev shell loads no published-report or replication corpus (the
      // Trip Report Portal and gallery fetch their own, tab-locally), so
      // these preview counts stay at zero.
      reportCount: "0",
      replicationCount: "0",
    }),
    [
      chemicalClassIndexGroups.length,
      dosageCategoryGroups.length,
      mechanismIndexGroups.length,
      substanceRecords.length,
    ],
  );

  const showCopyNotice = useCallback((next: AboutCopyNotice) => {
    setCopyNotice(next);
    clearTimeout(copyNoticeTimeoutRef.current ?? undefined);
    copyNoticeTimeoutRef.current = setTimeout(() => {
      setCopyNotice(null);
      copyNoticeTimeoutRef.current = null;
    }, COPY_NOTICE_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => clearTimeout(copyNoticeTimeoutRef.current ?? undefined);
  }, []);

  const copyToClipboard = useCallback(
    (target: AboutCopyNotice["target"], value: string) => {
      navigator.clipboard.writeText(value).then(
        () => showCopyNotice({ target, ok: true }),
        (error) => {
          console.error(`Failed to copy About ${target}`, error);
          showCopyNotice({ target, ok: false });
        },
      );
    },
    [showCopyNotice],
  );

  const replaceMarkdown = useCallback(
    (markdown: string) => applyDraftTransform((previous) => ({ ...previous, markdown })),
    [applyDraftTransform],
  );
  const replaceSubtitle = useCallback(
    (subtitle: string) => applyDraftTransform((previous) => ({ ...previous, subtitle })),
    [applyDraftTransform],
  );
  const resetMarkdown = useCallback(
    () => applyDraftTransform((previous) => ({ ...previous, markdown: original.markdown })),
    [applyDraftTransform, original.markdown],
  );
  const resetSubtitle = useCallback(
    () => applyDraftTransform((previous) => ({ ...previous, subtitle: original.subtitle })),
    [applyDraftTransform, original.subtitle],
  );
  const resetFounderKeys = useCallback(
    () =>
      applyDraftTransform((previous) => ({ ...previous, founderKeys: [...original.founderKeys] })),
    [applyDraftTransform, original.founderKeys],
  );

  const toggleFounderKey = useCallback(
    (rawKey: string) => {
      const key = rawKey.trim().toUpperCase();
      if (!key) {
        return;
      }
      applyDraftTransform((previous) => {
        const hasKey = previous.founderKeys.some((entry) => entry.trim().toUpperCase() === key);
        return {
          ...previous,
          founderKeys: normalizeFounderKeys(
            hasKey
              ? previous.founderKeys.filter((entry) => entry.trim().toUpperCase() !== key)
              : [...previous.founderKeys, key],
          ),
        };
      });
    },
    [applyDraftTransform],
  );

  const copyMarkdown = useCallback(
    () => copyToClipboard("markdown", draft.markdown),
    [copyToClipboard, draft.markdown],
  );
  const copySubtitle = useCallback(
    () => copyToClipboard("subtitle", draft.subtitle),
    [copyToClipboard, draft.subtitle],
  );

  const save = useCallback(async () => {
    setSaveState("saving");
    setNotice(null);
    try {
      const response = await fetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aboutMarkdown: draft.markdown,
          aboutSubtitle: draft.subtitle,
          founderProfileKeys: draft.founderKeys,
        }),
      });
      const payload = (await response.json()) as {
        about?: { aboutMarkdown: string; aboutSubtitle: string; founderProfileKeys: string[] };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "The About page could not be saved.");
      }
      // Advance only the baseline: `draft` here is the snapshot that was sent,
      // and anything typed while the request was in flight must stay pending.
      const saved = payload.about ? toAboutDocument(payload.about) : draft;
      applyHydration(({ draft: current }) => ({ draft: current, original: saved }));
      setSaveState("saved");
      setNotice({
        tone: "success",
        message: "Saved. The public About page is rebuilding with it now.",
      });
    } catch (error) {
      setSaveState("error");
      setNotice({
        tone: "danger",
        title: "Save failed",
        message: error instanceof Error ? error.message : "The About page could not be saved.",
      });
    }
  }, [applyHydration, draft]);

  return {
    isLoaded: aboutConfig !== undefined,
    draft,
    original,
    isDirty,
    saveState,
    notice,
    copyNotice,
    markdownDiff: markdownChangelog.markdown,
    subtitleDiff: subtitleChangelog.markdown,
    subtitleHasChanges: subtitleChangelog.hasChanges,
    placeholderValues,
    replaceMarkdown,
    replaceSubtitle,
    resetMarkdown,
    resetSubtitle,
    resetFounderKeys,
    toggleFounderKey,
    copyMarkdown,
    copySubtitle,
    save,
  };
}
