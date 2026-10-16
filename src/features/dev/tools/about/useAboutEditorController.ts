"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopyIndexSource } from "../useCopyIndexSource";

import { normalizeFounderKeys } from "@/data/content/about";
import {
  TRANSLATION_CREDIT_LOCALES,
  translationCreditsFor,
  type TranslationCredits,
} from "@/data/content/translationCredits";
import type {
  EditorActionStatusState,
  NoticeMessage,
} from "@/features/dev/components";
import { useEditorDocument } from "@/features/dev/context/editorDocumentSession";
import { buildTextChangelog } from "@/utils/data/changelog";
import { proposalSubmittedNotice, submitToolProposal } from "../proposalSubmission";
import type { AboutCopyNotice } from "./aboutEditorUtils";
import { CopyIndexRefusal, useCopyIndexOperation } from "../useCopyIndexOperation";

const API_PATH = "/api/dev/about";

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
  translationCredits?: unknown;
  revision?: number;
  aggregates?: AboutAggregateSource;
  updatedAt?: string | null;
  updatedBy?: string | null;
} | null | undefined;

export type AboutSaveFailure = "conflict" | "frozen" | "other";

type AboutDocument = {
  markdown: string;
  subtitle: string;
  founderKeys: string[];
  translationCredits: TranslationCredits;
  exists: boolean;
  revision: number;
}

function storedTranslationCredits(stored: unknown): TranslationCredits {
  const credits: TranslationCredits = {};
  for (const locale of TRANSLATION_CREDIT_LOCALES) {
    const list = translationCreditsFor(stored, locale);
    if (list.length) credits[locale] = list;
  }
  return credits;
}

function withLocaleCredits(credits: TranslationCredits, locale: string, list: TranslationCredits[string]): TranslationCredits {
  const { [locale]: _previous, ...rest } = credits;
  return list.length ? { ...rest, [locale]: list } : rest;
}

function toAboutDocument(aboutConfig: AboutConfigSource): AboutDocument {
  return {
    markdown: aboutConfig?.aboutMarkdown ?? "",
    subtitle: aboutConfig?.aboutSubtitle ?? "",
    founderKeys: aboutConfig?.founderProfileKeys ?? [],
    translationCredits: storedTranslationCredits(aboutConfig?.translationCredits),
    exists: aboutConfig != null,
    revision: aboutConfig?.revision ?? 0,
  };
}

export interface AboutEditorController {
  publicationUncertain: boolean;
  isLoaded: boolean;
  loadError: string | null;
  reloadSource: () => void;
  draft: AboutDocument;
  original: AboutDocument;
  isDirty: boolean;
  saveState: SaveState;
  notice: NoticeMessage | null;
  copyNotice: AboutCopyNotice | null;
  dismissCopyNotice: () => void;
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
  addTranslationCredit: (locale: string, profileKey: string) => void;
  removeTranslationCredit: (locale: string, profileKey: string) => void;
  setTranslationCreditContribution: (locale: string, profileKey: string, contribution: string) => void;
  resetTranslationCredits: () => void;
  copyMarkdown: () => void;
  copySubtitle: () => void;
  save: () => Promise<void>;
  saveFailure: AboutSaveFailure | null;
  dismissNotice: () => void;
  discard: () => void;
  loadLatest: () => void;
  loadingLatest: boolean;
  lastWrite: { at: string | null; by: string | null };
}

export interface AboutEditorControllerOptions {
  canApprove: boolean;
  placeholderValues?: Record<string, string>;
}

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
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [copyNotice, setCopyNotice] = useState<AboutCopyNotice | null>(null);
  const [saveFailure, setSaveFailure] = useState<AboutSaveFailure | null>(null);
  const replaceOnNext = useRef<AboutConfigSource | null | false>(false);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const { draft, original, isDirty, applyDraftTransform, applyHydration } = document;

  const markdownChangelog = useMemo(
    () => buildTextChangelog("About copy", original.markdown, draft.markdown),
    [draft.markdown, original.markdown],
  );
  const subtitleChangelog = useMemo(
    () => buildTextChangelog("About subtitle", original.subtitle, draft.subtitle),
    [draft.subtitle, original.subtitle],
  );

  const showCopyNotice = setCopyNotice;
  const dismissCopyNotice = useCallback(() => setCopyNotice(null), []);

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

  const addTranslationCredit = useCallback(
    (locale: string, rawKey: string) => {
      const profileKey = rawKey.trim().toUpperCase();
      if (!profileKey) return;
      applyDraftTransform((previous) => {
        const list = previous.translationCredits[locale] ?? [];
        if (list.some((credit) => credit.profileKey === profileKey)) return previous;
        return {
          ...previous,
          translationCredits: withLocaleCredits(previous.translationCredits, locale, [...list, { profileKey, contribution: "" }]),
        };
      });
    },
    [applyDraftTransform],
  );
  const removeTranslationCredit = useCallback(
    (locale: string, profileKey: string) =>
      applyDraftTransform((previous) => ({
        ...previous,
        translationCredits: withLocaleCredits(
          previous.translationCredits,
          locale,
          (previous.translationCredits[locale] ?? []).filter((credit) => credit.profileKey !== profileKey),
        ),
      })),
    [applyDraftTransform],
  );
  const setTranslationCreditContribution = useCallback(
    (locale: string, profileKey: string, contribution: string) =>
      applyDraftTransform((previous) => ({
        ...previous,
        translationCredits: withLocaleCredits(
          previous.translationCredits,
          locale,
          (previous.translationCredits[locale] ?? []).map((credit) =>
            credit.profileKey === profileKey ? { ...credit, contribution } : credit,
          ),
        ),
      })),
    [applyDraftTransform],
  );
  const resetTranslationCredits = useCallback(
    () => applyDraftTransform((previous) => ({ ...previous, translationCredits: original.translationCredits })),
    [applyDraftTransform, original.translationCredits],
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
    setSaveFailure(null);
    const snapshot = canApprove && publicationUncertain && publicationSnapshot.current ? publicationSnapshot.current : { draft, original };
    if (canApprove) publicationSnapshot.current = snapshot;
    const body = {
      aboutMarkdown: snapshot.draft.markdown,
      aboutSubtitle: snapshot.draft.subtitle,
      founderProfileKeys: snapshot.draft.founderKeys,
      translationCredits: snapshot.draft.translationCredits,
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
              translationCredits: original.translationCredits,
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
          translationCredits: snapshot.original.translationCredits,
        } : null }),
      });
      const payload = (await response.json()) as {
        about?: { aboutMarkdown: string; aboutSubtitle: string; founderProfileKeys: string[]; translationCredits?: TranslationCredits; revision?: number };
        unchanged?: boolean; replayed?: boolean;
        error?: string;
      };
      acknowledge(response, payload);
      const saved = payload.about
        ? toAboutDocument({ translationCredits: snapshot.draft.translationCredits, ...payload.about })
        : snapshot.draft;
      publicationSnapshot.current = null;
      applyHydration(({ draft: current }) => ({ draft: { ...current, revision: saved.revision, exists: saved.exists }, original: saved }));
      setSaveState("saved");
      setNotice({
        tone: "success",
        message: payload.unchanged ? "No publication was needed; the loaded content is unchanged." : payload.replayed ? "Your earlier publication went through. Someone may have published changes since." : "Saved. The public About page is rebuilding with it now.",
      });
    } catch (error) {
      setSaveState("error");
      setSaveFailure(error instanceof CopyIndexRefusal ? (error.conflict ? "conflict" : error.frozen ? "frozen" : "other") : "other");
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

  const dismissNotice = useCallback(() => setNotice(null), []);
  const discard = useCallback(() => {
    if (publicationUncertain) return;
    applyDraftTransform(() => original);
    setNotice(null);
    setSaveFailure(null);
    setSaveState("idle");
  }, [applyDraftTransform, original, publicationUncertain]);
  const loadLatest = useCallback(() => {
    if (publicationUncertain) return;
    replaceOnNext.current = aboutConfig ?? null;
    setLoadingLatest(true);
    source.reload();
  }, [aboutConfig, publicationUncertain, source]);
  useEffect(() => {
    if (replaceOnNext.current === false) return;
    if (source.error) {
      replaceOnNext.current = false;
      setLoadingLatest(false);
      setNotice({ tone: "danger", message: `The latest version could not be loaded. ${source.error}` });
      return;
    }
    if (aboutConfig === undefined || aboutConfig === replaceOnNext.current) return;
    replaceOnNext.current = false;
    setLoadingLatest(false);
    const latest = toAboutDocument(aboutConfig);
    applyHydration(() => ({ draft: latest, original: latest }));
    setSaveFailure(null);
    setSaveState("idle");
    setNotice({ tone: "info", message: "Loaded the latest version. Apply your edits again, then publish." });
  }, [aboutConfig, applyHydration, source.error]);

  return {
    saveFailure,
    dismissNotice,
    discard,
    loadLatest,
    loadingLatest,
    lastWrite: { at: aboutConfig?.updatedAt ?? null, by: aboutConfig?.updatedBy ?? null },
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
    dismissCopyNotice,
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
    addTranslationCredit,
    removeTranslationCredit,
    setTranslationCreditContribution,
    resetTranslationCredits,
    copyMarkdown,
    copySubtitle,
    save,
  };
}
