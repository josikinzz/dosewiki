import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { pickString, pickStringArray, postJson } from "./apiMutationClient";
import type { ProposalBaseline } from "../../lib/proposals/proposalBaseline";

// ============================================================================
// Types
// ============================================================================

export interface SaveArticlePayload {
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

/** One copy block as `POST /api/dev/proposals` accepts it under `payload.copyBlocks`. */
interface ProposalCopyBlock { key: string;
kind: "markdown" | "plain" | "list";
label: string;
group: string;
flavor?: string;
body?: string;
items?: string[]; }

/** The About document as `POST /api/dev/proposals` accepts it under `payload.about`. */
interface ProposalAbout { aboutMarkdown: string;
aboutSubtitle: string;
founderProfileKeys: string[]; }

/** Everything a proposal may carry: the save-article body plus the tab-local documents. */
export type ProposalPayload = SaveArticlePayload & {
  copyBlocks?: ProposalCopyBlock[];
  about?: ProposalAbout;
};

export interface SubmitProposalPayload {
  payload: ProposalPayload;
  summary: string;
  baselines: ProposalBaseline[];
  /** The returned proposal this submission rebases; the server supersedes it. */
  revisionOf?: string;
}

export interface SubmitProposalResult {
  proposalId: string;
}

// ============================================================================
// API Functions
// ============================================================================

const SAVE_ARTICLE_TIMEOUT_MS = 60_000;

async function saveArticle(payload: SaveArticlePayload): Promise<SaveArticleResult> {
  const requestSummary = {
    articleCount: Array.isArray(payload.articles) ? payload.articles.length : 0,
    indexLayoutCount: Array.isArray(payload.indexLayouts) ? payload.indexLayouts.length : 0,
    hasChangelog: payload.changelog !== undefined,
  };

  console.info("[saveArticle] request:start", requestSummary);

  const { response, result } = await postJson("/api/save-article", {
    body: payload,
    timeoutMs: SAVE_ARTICLE_TIMEOUT_MS,
    onNetworkError: (networkError) => {
      const aborted =
        networkError instanceof DOMException && networkError.name === "AbortError";
      const message = aborted
        ? `Postgres save request timed out after ${SAVE_ARTICLE_TIMEOUT_MS / 1000} seconds.`
        : `Postgres save request failed: ${
            networkError instanceof Error ? networkError.message : String(networkError)
          }`;
      console.error("[saveArticle] request:error", {
        ...requestSummary,
        message,
      });
      throw new Error(message);
    },
  });

  console.info("[saveArticle] request:response", {
    ...requestSummary,
    ok: response.ok,
    status: response.status,
    requestId: pickString(result.requestId) ?? null,
    savedItems: pickStringArray(result.savedItems),
    warningCount: pickStringArray(result.warnings).length,
  });

  if (!response.ok) {
    const details = pickStringArray(result.details);
    const error = pickString(result.error) ?? "Unable to save to Postgres.";
    const code = pickString(result.code);
    const phase = pickString(result.phase);
    const requestId = pickString(result.requestId);
    const diagnostics = [
      code ? `code=${code}` : null,
      phase ? `phase=${phase}` : null,
      requestId ? `requestId=${requestId}` : null,
    ].filter((entry): entry is string => entry !== null);
    const detailText = details.length > 0 ? ` ${details.join(" ")}` : "";
    const diagnosticText = diagnostics.length > 0 ? ` (${diagnostics.join(", ")})` : "";
    throw new Error(`${error}${detailText}${diagnosticText}`.trim());
  }

  return {
    success: true,
    requestId: pickString(result.requestId),
    savedItems: pickStringArray(result.savedItems),
    submittedBy: pickString(result.submittedBy),
    warnings: pickStringArray(result.warnings),
    verification: Array.isArray(result.verification)
      ? result.verification.filter(
          (
            value,
          ): value is {
            target: string;
            found: boolean;
            previousSlug: string | null;
            requestedSlug: string | null;
            storedSlug: string | null;
            storedTitle: string | null;
            titleMatches: boolean;
            slugMatches: boolean;
          } =>
            typeof value === "object" &&
            value !== null &&
            typeof (value as { target?: unknown }).target === "string" &&
            typeof (value as { found?: unknown }).found === "boolean" &&
            typeof (value as { titleMatches?: unknown }).titleMatches === "boolean" &&
            typeof (value as { slugMatches?: unknown }).slugMatches === "boolean",
        )
      : [],
    revalidatedPaths: Array.isArray(result.revalidatedPaths)
      ? result.revalidatedPaths.filter((value): value is string => typeof value === "string")
      : [],
    articleResult:
      result.articleResult && typeof result.articleResult === "object"
        ? {
            created: Number((result.articleResult as { created?: unknown }).created ?? 0),
            updated: Number((result.articleResult as { updated?: unknown }).updated ?? 0),
            skipped: Number((result.articleResult as { skipped?: unknown }).skipped ?? 0),
            errors: Array.isArray((result.articleResult as { errors?: unknown[] }).errors)
              ? (result.articleResult as { errors: unknown[] }).errors.filter(
                  (value): value is string => typeof value === "string",
                )
              : [],
          }
        : undefined,
    entry:
      result.entry && typeof result.entry === "object"
        ? {
            id: typeof (result.entry as { id?: unknown }).id === "string" ? (result.entry as { id: string }).id : "",
            createdAt:
              typeof (result.entry as { createdAt?: unknown }).createdAt === "string"
                ? (result.entry as { createdAt: string }).createdAt
                : "",
            commit: {
              sha:
                typeof (result.entry as { commit?: { sha?: unknown } }).commit?.sha === "string"
                  ? (result.entry as { commit: { sha: string } }).commit.sha
                  : "",
              url:
                typeof (result.entry as { commit?: { url?: unknown } }).commit?.url === "string"
                  ? (result.entry as { commit: { url: string } }).commit.url
                  : "",
              message:
                typeof (result.entry as { commit?: { message?: unknown } }).commit?.message === "string"
                  ? (result.entry as { commit: { message: string } }).commit.message
                  : "",
            },
            articles: Array.isArray((result.entry as { articles?: unknown }).articles)
              ? (result.entry as { articles: unknown[] }).articles.filter(
                  (value: unknown): value is { id: number; title: string; slug: string } =>
                    typeof value === "object" &&
                    value !== null &&
                    typeof (value as { id?: unknown }).id === "number" &&
                    typeof (value as { title?: unknown }).title === "string" &&
                    typeof (value as { slug?: unknown }).slug === "string",
                )
              : [],
            markdown:
              typeof (result.entry as { markdown?: unknown }).markdown === "string"
                ? (result.entry as { markdown: string }).markdown
                : "",
            submittedBy:
              typeof (result.entry as { submittedBy?: unknown }).submittedBy === "string"
                ? (result.entry as { submittedBy: string }).submittedBy
                : null,
          }
        : undefined,
  };
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

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useSaveArticleMutation() {
  const pending = useRef(new Map<string, { identity: string; operationId: string }>());
  return useMutation({
    mutationFn: (payload: SaveArticlePayload) => {
      const indexLayouts = payload.indexLayouts?.map((layout) => {
        const identity = JSON.stringify(layout);
        let operation = pending.current.get(layout.type);
        if (operation?.identity !== identity) {
          operation = { identity, operationId: crypto.randomUUID() };
          pending.current.set(layout.type, operation);
        }
        return { ...layout, operationId: operation.operationId };
      });
      return saveArticle({ ...payload, indexLayouts });
    },
  });
}

export function useSubmitProposalMutation() {
  return useMutation({
    mutationFn: submitProposal,
  });
}
