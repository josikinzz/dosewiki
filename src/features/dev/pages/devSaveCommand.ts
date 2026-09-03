import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { SaveToConvexPayload, SaveToConvexResult } from "@/hooks/useApiMutations";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";
import type { SubstanceArticle } from "@/schema";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import {
  buildCommitMarkdown,
  buildConvexSavePayload,
  normalizeConvexChangeLogEntry,
  type ArticleRecord,
  type MarkdownChange,
} from "./devModePageUtils";

/**
 * Who a save is attributed to. The Auth.js session cookie is the credential;
 * the save route authorizes from it server-side. `key` is the contributor
 * key the client shows while the save runs.
 */
export type DevSaveCredentials = {
  key: string;
};

export type ManualLayoutType = "psychoactive" | "chemical" | "mechanism";

export type ManualLayoutDocument = {
  type: ManualLayoutType;
  label: string;
  data: unknown;
  changelog: MarkdownChange;
};

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
  savedItems: string[];
  warnings: string[];
  resolvedSubmitterKey: string;
  changelogEntry: ChangeLogEntry | null;
  markChangesSaved: boolean;
  revalidatedPaths?: string[];
  requestId?: string;
};

export type DevSaveAvailability =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

export type DevSaveCommandAdapter = {
  noChangesMessage: string;
  verifiedMessage: (key: string) => string;
  validateAvailability: (draft: DevSaveDraft) => DevSaveAvailability;
  execute: (draft: DevSaveDraft, credentials: DevSaveCredentials) => Promise<DevSaveCommandResult>;
};

function buildIndexLayoutPayload(
  layout: ManualLayoutDocument,
): NonNullable<SaveToConvexPayload["indexLayouts"]>[number] | null {
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

export function buildConvexCommandPayload(draft: DevSaveDraft): {
  changedArticles: ArticleRecord[];
  payload: SaveToConvexPayload;
} {
  const result = buildConvexSavePayload({
    articles: draft.articles,
    originalArticles: draft.originalArticles,
    datasetChangelog: draft.changelog.dataset,
  });
  const changedLayouts = draft.layouts
    .map(buildIndexLayoutPayload)
    .filter((layout): layout is NonNullable<SaveToConvexPayload["indexLayouts"]>[number] =>
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

export function createConvexSaveAdapter({
  serverHealth,
  saveToConvex,
}: {
  serverHealth: EditorServerConfigHealth;
  saveToConvex: (payload: SaveToConvexPayload) => Promise<SaveToConvexResult>;
}): DevSaveCommandAdapter {
  return {
    noChangesMessage: "No changes to save.",
    verifiedMessage: (key) => `Credentials verified for ${key}. Saving to Convex...`,
    validateAvailability: () => {
      if (serverHealth.status === "unhealthy" && !serverHealth.canSaveToConvex) {
        return {
          ok: false,
          message:
            serverHealth.issues[0] ??
            "Convex save is unavailable until the server configuration is fixed.",
        };
      }

      return { ok: true };
    },
    execute: async (draft, credentials) => {
      const { payload } = buildConvexCommandPayload(draft);
      const result = await saveToConvex(payload);
      const resolvedSubmitterKey = result.submittedBy?.trim() || credentials.key;

      return {
        savedItems: result.savedItems,
        warnings: result.warnings ?? [],
        resolvedSubmitterKey,
        changelogEntry: result.entry ? normalizeConvexChangeLogEntry(result.entry) : null,
        markChangesSaved: result.savedItems.length > 0 && !(result.warnings?.length),
        revalidatedPaths: result.revalidatedPaths,
        requestId: result.requestId,
      };
    },
  };
}
