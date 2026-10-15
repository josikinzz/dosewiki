import { contentHash } from "../../lib/proposals/contentHash";
import { ArticleSaveUnconfirmedError, parseArticleBatchSuccess, parsePendingArticleBatch } from "./articleBatchClient";
import { useDraftRecoveryStore } from "@/features/dev/recovery/DraftRecoveryContext";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { pickString, pickStringArray, postJson } from "./apiMutationClient";
import type { ProposalBaseline } from "../../lib/proposals/proposalBaseline";

export interface SaveArticlePayload {
  operationId?: string;
  articleAdmissions?: Array<{ kind: "create"; slug: string } | { kind: "replace-existing"; slug: string; baseHash: string }>;
  articles?: unknown[];
  indexLayouts?: Array<{
    type: "psychoactive" | "chemical" | "mechanism";
    version: number;
    categories: unknown[];
    expected?: unknown;
    expectedRevision?: number;
    operationId?: string;
  }>;
  changelog?: {
    markdown: string;
    articles: Array<{
      id: number;
      title: string;
      slug: string;
    }>;
  };
}

export interface SaveArticleResult {
  success: boolean;
  operationId?: string;
  confirmsCurrentDraft?: boolean;
  articleReceipts?: Array<{ slug: string; baseHash: string; unchanged: boolean }>;
  requestId?: string;
  savedItems: string[];
  submittedBy?: string;
  warnings?: string[];
  articleResult?: {
    created: number;
    updated: number;
    skipped?: number;
    errors: string[];
  };
  verification?: Array<{
    target: string;
    found: boolean;
    previousSlug: string | null;
    requestedSlug: string | null;
    storedSlug: string | null;
    storedTitle: string | null;
    titleMatches: boolean;
    slugMatches: boolean;
  }>;
  revalidatedPaths?: string[];
  entry?: {
    id: string;
    createdAt: string;
    commit: {
      sha: string;
      url: string;
      message: string;
    };
    articles: Array<{
      id: number;
      title: string;
      slug: string;
    }>;
    markdown: string;
    submittedBy: string | null;
  };
  error?: string;
}

interface ProposalCopyBlock { key: string;
kind: "markdown" | "plain" | "list";
label: string;
group: string;
flavor?: string;
body?: string;
items?: string[]; }

interface ProposalAbout { aboutMarkdown: string;
aboutSubtitle: string;
founderProfileKeys: string[]; }

interface ProposalWriting { slug: string;
kind: "article" | "blog";
status: "draft" | "published";
bodyFormat: "vcode" | "markdown";
title: string;
teaser: string;
coverImageUrl: string;
body: string;
tags: string[];
authorProfileKeys: string[];
publicationDate?: string; }

export type ProposalPayload = SaveArticlePayload & {
  copyBlocks?: ProposalCopyBlock[];
  about?: ProposalAbout;
  writing?: ProposalWriting;
};

export interface SubmitProposalPayload {
  payload: ProposalPayload;
  summary: string;
  baselines: ProposalBaseline[];
  revisionOf?: string;
}

export interface SubmitProposalResult {
  proposalId: string;
}

const SAVE_ARTICLE_TIMEOUT_MS = 60_000;
async function saveArticle(payload: SaveArticlePayload & { operationId: string }): Promise<SaveArticleResult> {
  const { response, result } = await postJson("/api/save-article", {
    body: payload, timeoutMs: SAVE_ARTICLE_TIMEOUT_MS,
    onNetworkError: () => { throw new ArticleSaveUnconfirmedError(); },
  });
  if (!response.ok) {
    if (response.status >= 500 && result?.code !== "DATA_WRITES_FROZEN") throw new ArticleSaveUnconfirmedError();
    const error = pickString(result?.error) ?? "Unable to save to Postgres.";
    const details = pickStringArray(result?.details);
    throw new Error([error, ...details].join(" "));
  }
  return parseArticleBatchSuccess(result, payload);
}

const SUBMIT_PROPOSAL_TIMEOUT_MS = 60_000;

async function submitProposal(input: SubmitProposalPayload): Promise<SubmitProposalResult> {
  const { response, result } = await postJson("/api/dev/proposals", {
    body: input,
    timeoutMs: SUBMIT_PROPOSAL_TIMEOUT_MS,
    onNetworkError: (networkError) => {
      const aborted = networkError instanceof DOMException && networkError.name === "AbortError";
      throw new Error(
        aborted
          ? `Proposal request timed out after ${SUBMIT_PROPOSAL_TIMEOUT_MS / 1000} seconds.`
          : `Proposal request failed: ${
              networkError instanceof Error ? networkError.message : String(networkError)
            }`,
      );
    },
  });

  if (!response.ok) {
    const error = pickString(result.error) ?? "Unable to submit the proposal.";
    const code = pickString(result.code);
    throw new Error(code ? `${error} (code=${code})` : error);
  }

  const proposalId = pickString(result.proposalId);
  if (!proposalId) {
    throw new Error("Proposal response did not include a proposal id.");
  }
  return { proposalId };
}

export function useSaveArticleMutation() {
  const store = useDraftRecoveryStore();
  const pending = useRef<{ actor: string | null; uncertain: boolean; payload: SaveArticlePayload & { operationId: string } } | null>(null);
  const currentActor = useRef(store?.actor ?? null);
  currentActor.current = store?.actor ?? null;
  return useMutation({
    mutationFn: async (payload: SaveArticlePayload) => {
      const actor = store?.actor ?? null;
      if (pending.current?.actor !== actor) pending.current = null;
      if (!pending.current) {
        const recovered = store?.read<null>("staged-articles", "pending-publication")?.pending;
        if (recovered) {
          try {
            const parsed = parsePendingArticleBatch(JSON.parse(recovered.body), recovered.id);
            pending.current = { actor, uncertain: true, payload: parsed };
          } catch { throw new ArticleSaveUnconfirmedError(); }
        }
      }
      if (!pending.current) pending.current = { actor, uncertain: false, payload: JSON.parse(JSON.stringify({ ...payload, operationId: crypto.randomUUID() })) };
      const state = pending.current;
      const operation = state.payload;
      store?.write({ tool: "staged-articles", record: "pending-publication", baseline: operation.operationId, draft: null, pending: { id: operation.operationId, body: JSON.stringify(operation) } });
      try {
        const result = await saveArticle(operation);
        const { operationId: _id, ...original } = operation;
        const { operationId: _currentId, ...current } = payload;
        const confirmsCurrentDraft = currentActor.current === actor && contentHash(original) === contentHash(current);
        if (pending.current === state) pending.current = null;
        store?.clear("staged-articles", "pending-publication");
        return { ...result, confirmsCurrentDraft };
      } catch (error) {
        if (error instanceof ArticleSaveUnconfirmedError) state.uncertain = true;
        if (!state.uncertain) {
          if (pending.current === state) pending.current = null;
          store?.clear("staged-articles", "pending-publication");
        }
        throw error;
      }
    },
  });
}

export function useSubmitProposalMutation() {
  return useMutation({
    mutationFn: submitProposal,
  });
}
