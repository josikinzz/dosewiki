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

export type DevSaveCredentials = {
  username: string;
  password: string;
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
  about: {
    markdown: string;
    subtitle: string;
    founderKeys: string[];
    hasChanges: boolean;
    changelog: {
      markdown: MarkdownChange;
      subtitle: MarkdownChange;
      founders: MarkdownChange;
    };
  };
  convexEnabled: boolean;
  hasPendingChanges: boolean;
  changelog: {
    dataset: DatasetChangelogResult;
  };
};

export type DevSaveDraftInput = {
  articles: SubstanceArticle[];
  originalArticles: SubstanceArticle[];
  layouts: ManualLayoutDocument[];
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  convexEnabled: boolean;
  datasetChangelog: DatasetChangelogResult;
  aboutMarkdownChangelog: MarkdownChange;
  aboutSubtitleChangelog: MarkdownChange;
  aboutFounderChangelog: MarkdownChange;
  hasAboutMarkdownChanges: boolean;
  hasAboutSubtitleChanges: boolean;
  hasAboutFounderChanges: boolean;
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
  const hasAboutChanges =
    input.hasAboutMarkdownChanges || input.hasAboutSubtitleChanges || input.hasAboutFounderChanges;

  return {
    articles: input.articles,
    originalArticles: input.originalArticles,
    layouts: input.layouts,
    about: {
      markdown: input.aboutMarkdown,
      subtitle: input.aboutSubtitle,
      founderKeys: input.aboutFounderKeys,
      hasChanges: hasAboutChanges,
      changelog: {
        markdown: input.aboutMarkdownChangelog,
        subtitle: input.aboutSubtitleChangelog,
        founders: input.aboutFounderChangelog,
      },
    },
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
    draft.about.changelog.markdown,
    draft.about.changelog.subtitle,
    draft.about.changelog.founders,
  ]);

  return {
    username: credentials.username,
    password: credentials.password,
    articlesData: draft.articles,
    commitMessage: `Dev editor update - ${now.toLocaleString()}`,
    changelogMarkdown,
    changedArticles: draft.changelog.dataset.articles,
    psychoactiveIndexManualData: draft.layouts.find((layout) => layout.type === "psychoactive")?.data,
    chemicalIndexManualData: draft.layouts.find((layout) => layout.type === "chemical")?.data,
    mechanismIndexManualData: draft.layouts.find((layout) => layout.type === "mechanism")?.data,
    aboutMarkdown: draft.about.markdown,
    aboutSubtitleMarkdown: draft.about.subtitle,
    aboutConfig: { founderProfileKeys: draft.about.founderKeys },
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
    hasAboutChanges: draft.about.hasChanges,
    aboutMarkdown: draft.about.markdown,
    aboutSubtitle: draft.about.subtitle,
    aboutFounderKeys: draft.about.founderKeys,
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
    validateAvailability: () => ({ ok: true }),
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
