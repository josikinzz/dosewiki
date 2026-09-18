"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopyIndexSource } from "../useCopyIndexSource";

import { normalizeFounderKeys } from "@/data/content/about";
import type {
  EditorActionStatusState,
  EditorNoticeMessage,
} from "@/features/dev/components";
import { useEditorDocument } from "@/features/dev/context/editorDocumentSession";
import { buildTextChangelog } from "@/utils/data/changelog";
import { proposalSubmittedNotice, submitToolProposal } from "../proposalSubmission";
import type { AboutCopyNotice } from "./aboutEditorUtils";
import { useCopyIndexOperation } from "../useCopyIndexOperation";

const API_PATH = "/api/dev/about";
const COPY_NOTICE_DURATION_MS = 2500;

type SaveState = EditorActionStatusState | "idle";

type AboutAggregateSource = {
  compoundCount: number;
  psychoactiveClassCount: number;
  categoryCount: number;
  chemicalClassCount: number;
  mechanismClassCount: number;
  mechanismOfActionClassCount: number;
  reportCount: number;
  replicationCount: number;
};

type AboutConfigSource = {
  aboutMarkdown?: string | null;
  aboutSubtitle?: string | null;
  founderProfileKeys?: string[] | null;
  revision?: number;
  aggregates?: AboutAggregateSource;
} | null | undefined;

type AboutDocument = {
  markdown: string;
  subtitle: string;
  founderKeys: string[];
  exists: boolean;
  revision: number;
}

function toAboutDocument(aboutConfig: AboutConfigSource): AboutDocument {
  return {
    markdown: aboutConfig?.aboutMarkdown ?? "",
    subtitle: aboutConfig?.aboutSubtitle ?? "",
    founderKeys: aboutConfig?.founderProfileKeys ?? [],
    exists: aboutConfig != null,
    revision: aboutConfig?.revision ?? 0,
  };
}

export interface AboutEditorController {
  /** False until the Postgres About document has arrived. */
  publicationUncertain: boolean;
  isLoaded: boolean;
  loadError: string | null;
  reloadSource: () => void;
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
  /** Admin: writes the document. Editor: submits it as a change proposal and keeps the draft pending. */
  save: () => Promise<void>;
}

export interface AboutEditorControllerOptions {
  /** Admin: Save writes About; without it the same draft is submitted as a proposal. */
  canApprove: boolean;
  placeholderValues?: Record<string, string>;
}

/**
 * The About editor's own session over the Postgres `siteConfig` About document.
 *
 * About is the pinned first entry of the Writing tab and saves the way its
 * siblings do: one immediate `POST /api/dev/about` carrying the whole
 * document, after which the draft becomes the new baseline. It stages nothing
 * into the shell's commit panel and contributes nothing to the dataset
 * changelog. Without `canApprove` the same document is posted to
 * `/api/dev/proposals` instead and the draft stays pending until an admin
 * approves it, since production has not changed yet.
 */
export function useAboutEditorController({ canApprove, placeholderValues = {} }: AboutEditorControllerOptions): AboutEditorController {
  const source = useCopyIndexSource<AboutConfigSource>(API_PATH);
  const aboutConfig = source.data;
  const aggregatePlaceholders = useMemo(() => Object.fromEntries(
    Object.entries(aboutConfig?.aggregates ?? {}).map(([key, value]) => [key, value.toLocaleString()]),
  ), [aboutConfig?.aggregates]);
  const resolvedPlaceholderValues = useMemo(
    () => ({ ...aggregatePlaceholders, ...placeholderValues }),
    [aggregatePlaceholders, placeholderValues],
  );
  const document = useEditorDocument(toAboutDocument(aboutConfig));
  const { serialize: publicationBody, acknowledge, uncertain: publicationUncertain } = useCopyIndexOperation();
  const publicationSnapshot = useRef<{ draft: AboutDocument; original: AboutDocument } | null>(null);

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
    const snapshot = canApprove && publicationUncertain && publicationSnapshot.current ? publicationSnapshot.current : { draft, original };
    if (canApprove) publicationSnapshot.current = snapshot;
    const body = {
      aboutMarkdown: snapshot.draft.markdown,
      aboutSubtitle: snapshot.draft.subtitle,
      founderProfileKeys: snapshot.draft.founderKeys,
    };
    try {
      if (!canApprove) {
        const { proposalId } = await submitToolProposal({
          payload: { about: body },
          summary: "Update the About page",
          baselines: [{
            kind: "about",
            key: "about",
            document: original.exists ? {
              aboutMarkdown: original.markdown,
              aboutSubtitle: original.subtitle,
              founderProfileKeys: original.founderKeys,
            } : null,
          }],
        });
        setSaveState("saved");
        setNotice(proposalSubmittedNotice("The About page", proposalId));
        return;
      }

      const response = await fetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: publicationBody({ ...body, expectedRevision: snapshot.original.revision, expected: snapshot.original.exists ? {
          aboutMarkdown: snapshot.original.markdown, aboutSubtitle: snapshot.original.subtitle, founderProfileKeys: snapshot.original.founderKeys,
        } : null }),
      });
      const payload = (await response.json()) as {
        about?: { aboutMarkdown: string; aboutSubtitle: string; founderProfileKeys: string[]; revision?: number };
        unchanged?: boolean; replayed?: boolean;
        error?: string;
      };
      acknowledge(response, payload);
      // Advance only the baseline: `draft` here is the snapshot that was sent,
      // and anything typed while the request was in flight must stay pending.
      const saved = payload.about ? toAboutDocument(payload.about) : snapshot.draft;
      publicationSnapshot.current = null;
      applyHydration(({ draft: current }) => ({ draft: { ...current, revision: saved.revision, exists: saved.exists }, original: saved }));
      setSaveState("saved");
      setNotice({
        tone: "success",
        message: payload.unchanged ? "No publication was needed; the loaded content is unchanged." : payload.replayed ? "Your earlier publication receipt is confirmed. Later public edits may exist." : "Saved. The public About page is rebuilding with it now.",
      });
    } catch (error) {
      setSaveState("error");
      setNotice({
        tone: "danger",
        title: canApprove ? "Save failed" : "Submission failed",
        message:
          error instanceof Error
            ? error.message
            : canApprove
              ? "The About page could not be saved."
              : "The proposal could not be submitted.",
      });
    }
  }, [applyHydration, canApprove, draft, original, publicationBody, acknowledge, publicationUncertain]);

  return {
    isLoaded: aboutConfig !== undefined,
    loadError: source.error,
    reloadSource: source.reload,
    publicationUncertain,
    draft,
    original,
    isDirty,
    saveState,
    notice,
    copyNotice,
    markdownDiff: markdownChangelog.markdown,
    subtitleDiff: subtitleChangelog.markdown,
    subtitleHasChanges: subtitleChangelog.hasChanges,
    placeholderValues: resolvedPlaceholderValues,
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
