import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type {
  SaveArticlesPayload,
  SaveArticlesResult,
  SaveToConvexPayload,
  SaveToConvexResult,
} from "@/hooks/useApiMutations";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";
import type { SubstanceArticle } from "@/schema";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import {
  buildCommitMarkdown,
  buildConvexSavePayload,
  normalizeConvexChangeLogEntry,
  normalizeGitHubChangeLogEntry,
  type ArticleRecord,
  type MarkdownChange,
} from "./devModePageUtils";

/**
 * Who a save is attributed to. The Auth.js session cookie is the credential;
 * every save route authorizes from it server-side. `key` is the contributor
 * key the client shows and sends as the archive's `username` label.
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
  /**
   * Whether every row in `articles` holds a whole article rather than a slim
   * library-list row. The Convex save only ships rows that differ from their
   * own baseline, so an un-hydrated row can never reach it; the GitHub archive
   * writes the corpus wholesale and therefore has to refuse.
   */
  articlesAreComplete: boolean;
  layouts: ManualLayoutDocument[];
  convexEnabled: boolean;
  hasPendingChanges: boolean;
  changelog: {
    dataset: DatasetChangelogResult;
  };
};

export type DevSaveDraftInput = {
  articles: SubstanceArticle[];
  originalArticles: SubstanceArticle[];
  articlesAreComplete: boolean;
  layouts: ManualLayoutDocument[];
  convexEnabled: boolean;
  datasetChangelog: DatasetChangelogResult;
  hasPendingChanges: boolean;
};

export type DevSaveCommandResult = {
  destination: "convex" | "github";
  savedItems: string[];
  warnings: string[];
  resolvedSubmitterKey: string;
  changelogEntry: ChangeLogEntry | null;
  markChangesSaved: boolean;
  actionHref?: string;
  actionLabel?: string;
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
  destination: DevSaveCommandResult["destination"];
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
    articlesAreComplete: input.articlesAreComplete,
    layouts: input.layouts,
    convexEnabled: input.convexEnabled,
    hasPendingChanges: input.hasPendingChanges,
    changelog: {
      dataset: input.datasetChangelog,
    },
  };
}

export function buildGitHubSavePayload(
  draft: DevSaveDraft,
  credentials: DevSaveCredentials,
  now: Date = new Date(),
): SaveArticlesPayload {
  const changelogMarkdown = buildCommitMarkdown([
    {
      hasChanges: draft.changelog.dataset.markdown.trim().length > 0,
      markdown: draft.changelog.dataset.markdown,
    },
    ...draft.layouts.map((layout) => layout.changelog),
  ]);

  return {
    username: credentials.key,
    articlesData: draft.articles,
    commitMessage: `Dev editor update - ${now.toLocaleString()}`,
    changelogMarkdown,
    changedArticles: draft.changelog.dataset.articles,
    psychoactiveIndexManualData: draft.layouts.find((layout) => layout.type === "psychoactive")?.data,
    chemicalIndexManualData: draft.layouts.find((layout) => layout.type === "chemical")?.data,
    mechanismIndexManualData: draft.layouts.find((layout) => layout.type === "mechanism")?.data,
    skipArticles: draft.convexEnabled,
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
    destination: "convex",
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
        destination: "convex",
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

export function createGitHubSaveAdapter({
  saveArticles,
  now = () => new Date(),
}: {
  saveArticles: (payload: SaveArticlesPayload) => Promise<SaveArticlesResult>;
  now?: () => Date;
}): DevSaveCommandAdapter {
  return {
    destination: "github",
    noChangesMessage: "No changes detected to archive.",
    verifiedMessage: (key) => `Credentials verified for ${key}. Archiving to GitHub...`,
    // The GitHub archive rewrites the whole articles file from `draft.articles`,
    // so it must never run against the slim library list. Convex saves are
    // diff-scoped and unaffected, so the guard applies only when articles are
    // actually being written.
    validateAvailability: (draft) =>
      draft.convexEnabled || draft.articlesAreComplete
        ? { ok: true }
        : {
            ok: false,
            message:
              "The full article corpus has not loaded yet, so archiving to GitHub would overwrite it with an empty dataset. Open the Tag editor to load it, then try again.",
          },
    execute: async (draft, credentials) => {
      const payload = buildGitHubSavePayload(draft, credentials, now());
      const result = await saveArticles(payload);
      const resolvedSubmitterKey = result.submittedBy?.trim() || credentials.key;

      return {
        destination: "github",
        savedItems: ["GitHub"],
        warnings: [],
        resolvedSubmitterKey,
        changelogEntry: normalizeGitHubChangeLogEntry(
          result.entry,
          payload.commitMessage,
          resolvedSubmitterKey,
        ),
        markChangesSaved: false,
        actionHref: result.commitUrl,
        actionLabel: result.commitUrl ? "Open commit" : undefined,
      };
    },
  };
}
