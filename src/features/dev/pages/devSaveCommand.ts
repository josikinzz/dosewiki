import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type {
  SaveArticlePayload,
  SaveArticleResult,
  SubmitProposalPayload,
  SubmitProposalResult,
} from "@/hooks/useApiMutations";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";
import type { SubstanceArticle } from "@/schema";
import type { DevCommitDestination } from "../components/DevCommitCard";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import {
  buildCommitMarkdown,
  buildDataSavePayload,
  normalizeDataChangeLogEntry,
  type ArticleRecord,
  type MarkdownChange,
} from "./devModePageUtils";
import { resolveEditorArticleSlug, EMPTY_INDEX_CONFIG } from "../context/devModeUtils";
import type { ProposalBaseline } from "../../../../lib/proposals/proposalBaseline";

/**
 * Who a save is attributed to. The Auth.js session cookie is the credential;
 * the save route authorizes from it server-side. `key` is the contributor
 * key the client shows while the save runs.
 */
export type DevSaveCredentials = {
  key: string;
};

type ManualLayoutType = "psychoactive" | "chemical" | "mechanism"

type ManualLayoutDocument = {
  type: ManualLayoutType;
  label: string;
  data: unknown;
  originalData: unknown;
  changelog: MarkdownChange;
}

export type DevSaveDraft = {
  articles: SubstanceArticle[];
  originalArticles: SubstanceArticle[];
  layouts: ManualLayoutDocument[];
  hasPendingChanges: boolean;
  changelog: {
    dataset: DatasetChangelogResult;
  };
};

export type DevSaveDraftInput = {
  articles: SubstanceArticle[];
  originalArticles: SubstanceArticle[];
  layouts: ManualLayoutDocument[];
  datasetChangelog: DatasetChangelogResult;
  hasPendingChanges: boolean;
};

export type DevSaveCommandResult = {
  /** Where the save went: written to production, or held as a proposal. */
  destination: DevCommitDestination;
  savedItems: string[];
  warnings: string[];
  resolvedSubmitterKey: string;
  changelogEntry: ChangeLogEntry | null;
  markChangesSaved: boolean;
  revalidatedPaths?: string[];
  requestId?: string;
  /** Follow-up link shown beside the success notice (e.g. the review queue). */
  actionHref?: string;
  actionLabel?: string;
};

type DevSaveAvailability = | { ok: true }
| {
    ok: false;
    message: string;
  }

export type DevSaveCommandAdapter = {
  noChangesMessage: string;
  verifiedMessage: (key: string) => string;
  validateAvailability: (draft: DevSaveDraft) => DevSaveAvailability;
  execute: (draft: DevSaveDraft, credentials: DevSaveCredentials) => Promise<DevSaveCommandResult>;
};

function buildIndexLayoutPayload(
  layout: ManualLayoutDocument,
): NonNullable<SaveArticlePayload["indexLayouts"]>[number] | null {
  if (!layout.changelog.hasChanges || typeof layout.data !== "object" || layout.data === null) {
    return null;
  }

  const data = layout.data as { version?: unknown; categories?: unknown };
  if (typeof data.version !== "number" || !Array.isArray(data.categories)) {
    return null;
  }

  return {
    type: layout.type,
    version: data.version,
    categories: data.categories,
  };
}

export function buildDevSaveDraft(input: DevSaveDraftInput): DevSaveDraft {
  return {
    articles: input.articles,
    originalArticles: input.originalArticles,
    layouts: input.layouts,
    hasPendingChanges: input.hasPendingChanges,
    changelog: {
      dataset: input.datasetChangelog,
    },
  };
}

export function buildDataCommandPayload(draft: DevSaveDraft): {
  changedArticles: ArticleRecord[];
  payload: SaveArticlePayload;
} {
  const result = buildDataSavePayload({
    articles: draft.articles,
    originalArticles: draft.originalArticles,
    datasetChangelog: draft.changelog.dataset,
  });
  const changedLayouts = draft.layouts
    .map(buildIndexLayoutPayload)
    .filter((layout): layout is NonNullable<SaveArticlePayload["indexLayouts"]>[number] =>
      layout !== null,
    );

  if (changedLayouts.length > 0) {
    result.payload.indexLayouts = changedLayouts;
  }

  const layoutMarkdown = buildCommitMarkdown(draft.layouts.map((layout) => layout.changelog)).trimEnd();
  if (layoutMarkdown) {
    result.payload.changelog = {
      markdown: buildCommitMarkdown([
        result.payload.changelog
          ? { hasChanges: true, markdown: result.payload.changelog.markdown }
          : { hasChanges: false, markdown: "" },
        { hasChanges: true, markdown: layoutMarkdown },
      ]).trimEnd(),
      articles: result.payload.changelog?.articles ?? [],
    };
  }

  return result;
}

export function createDataSaveAdapter({
  serverHealth,
  saveArticle,
}: {
  serverHealth: EditorServerConfigHealth;
  saveArticle: (payload: SaveArticlePayload) => Promise<SaveArticleResult>;
}): DevSaveCommandAdapter {
  return {
    noChangesMessage: "No changes to commit.",
    verifiedMessage: (key) => `Committing to production as ${key}...`,
    validateAvailability: () => {
      if (serverHealth.status === "unhealthy" && !serverHealth.canSaveToPostgres) {
        return {
          ok: false,
          message:
            serverHealth.issues[0] ??
            "Commits are paused until the server configuration is fixed.",
        };
      }

      return { ok: true };
    },
    execute: async (draft, credentials) => {
      const { payload } = buildDataCommandPayload(draft);
      for (const layout of payload.indexLayouts ?? []) {
        const original = draft.layouts.find((row) => row.type === layout.type)?.originalData;
        if (original === undefined) throw new Error("The layout baseline is unavailable. Your draft is preserved; reload the source.");
        layout.expected = original === EMPTY_INDEX_CONFIG ? null : original;
        layout.expectedRevision = original && typeof original === "object" && "revision" in original && typeof original.revision === "number" ? original.revision : 0;
      }
      const result = await saveArticle(payload);
      const resolvedSubmitterKey = result.submittedBy?.trim() || credentials.key;

      return {
        destination: "production",
        savedItems: result.savedItems,
        warnings: result.warnings ?? [],
        resolvedSubmitterKey,
        changelogEntry: result.entry ? normalizeDataChangeLogEntry(result.entry) : null,
        markChangesSaved: result.savedItems.length > 0 && !(result.warnings?.length),
        revalidatedPaths: result.revalidatedPaths,
        requestId: result.requestId,
      };
    },
  };
}

/** Short id shown in the notice: the tail of a Postgres id is what differs between rows. */
const PROPOSAL_ID_DISPLAY_LENGTH = 6;

/**
 * One-line summary of a proposal for the queue: the changed article titles and
 * layout types, in payload order, so an admin can tell rows apart at a glance.
 */
export function buildProposalSummary(draft: DevSaveDraft, payload: SaveArticlePayload): string {
  const articleTitles = (payload.articles ?? []).map((article) => {
    const record = article && typeof article === "object" ? (article as { title?: unknown }) : {};
    return typeof record.title === "string" && record.title.trim() ? record.title.trim() : "Untitled article";
  });
  const layoutLabels = (payload.indexLayouts ?? []).map(
    (layout) => draft.layouts.find((candidate) => candidate.type === layout.type)?.label ?? `${layout.type} layout`,
  );
  const items = [...articleTitles, ...layoutLabels];
  if (items.length === 0) {
    return "Editor update";
  }
  const shown = items.slice(0, 3).join(", ");
  return items.length > 3 ? `Update ${shown} and ${items.length - 3} more` : `Update ${shown}`;
}

/**
 * The editor-side adapter: the same payload the Postgres adapter would save is
 * posted to /api/dev/proposals with the original documents the editor loaded.
 * The server refuses stale baselines and derives its own diff. With `revisionOf`
 * the submission revises that returned proposal, which the server supersedes.
 */
export function createProposalSaveAdapter({
  submitProposal,
  revisionOf = null,
}: {
  submitProposal: (input: SubmitProposalPayload) => Promise<SubmitProposalResult>;
  revisionOf?: string | null;
}): DevSaveCommandAdapter {
  return {
    noChangesMessage: "No changes to submit.",
    verifiedMessage: (key) => `Submitting for review as ${key}...`,
    validateAvailability: () => ({ ok: true }),
    execute: async (draft, credentials) => {
      const { payload } = buildDataCommandPayload(draft);
      const baselines: ProposalBaseline[] = [
        ...(payload.articles ?? []).map((value) => {
          const article = value as SubstanceArticle;
          const key = resolveEditorArticleSlug(article);
          if (!key) throw new Error("The article needs a slug before it can be submitted.");
          const original = draft.originalArticles.find((row) =>
            article.id !== null && article.id !== undefined ? row.id === article.id : resolveEditorArticleSlug(row) === key);
          return { kind: "article" as const, key, document: original ?? null };
        }),
        ...(payload.indexLayouts ?? []).map((layout) => {
          const original = draft.layouts.find((row) => row.type === layout.type)!.originalData;
          if (original === undefined) throw new Error("The layout baseline is unavailable. Your draft is preserved; reload the source.");
          return { kind: "indexLayout" as const, key: layout.type, document: original === EMPTY_INDEX_CONFIG ? null : original };
        }),
      ];
      const result = await submitProposal({
        payload,
        summary: buildProposalSummary(draft, payload),
        baselines,
        ...(revisionOf ? { revisionOf } : {}),
      });

      return {
        destination: "proposal",
        savedItems: [`Proposal #${result.proposalId.slice(-PROPOSAL_ID_DISPLAY_LENGTH)}`],
        warnings: [],
        resolvedSubmitterKey: credentials.key,
        changelogEntry: null,
        markChangesSaved: true,
        actionLabel: "View in queue",
        actionHref: "/dev/queue",
      };
    },
  };
}
