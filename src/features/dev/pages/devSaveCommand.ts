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

export type DevSaveDraft = {
  articles: SubstanceArticle[];
  originalArticles: SubstanceArticle[];
  psychoactiveIndexManual: unknown;
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
  generatorPrompt: {
    content: string;
    hasChanges: boolean;
  };
  convexEnabled: boolean;
  hasPendingChanges: boolean;
  changelog: {
    dataset: DatasetChangelogResult;
    psychoactiveManual: MarkdownChange;
  };
};

export type DevSaveDraftInput = {
  articles: SubstanceArticle[];
  originalArticles: SubstanceArticle[];
  psychoactiveIndexManual: unknown;
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  generatorPrompt: string;
  convexEnabled: boolean;
  datasetChangelog: DatasetChangelogResult;
  psychoactiveManualChangelog: MarkdownChange;
  aboutMarkdownChangelog: MarkdownChange;
  aboutSubtitleChangelog: MarkdownChange;
  aboutFounderChangelog: MarkdownChange;
  hasAboutMarkdownChanges: boolean;
  hasAboutSubtitleChanges: boolean;
  hasAboutFounderChanges: boolean;
  hasGeneratorPromptChanges: boolean;
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

export function buildDevSaveDraft(input: DevSaveDraftInput): DevSaveDraft {
  const hasAboutChanges =
    input.hasAboutMarkdownChanges || input.hasAboutSubtitleChanges || input.hasAboutFounderChanges;

  return {
    articles: input.articles,
    originalArticles: input.originalArticles,
    psychoactiveIndexManual: input.psychoactiveIndexManual,
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
    generatorPrompt: {
      content: input.generatorPrompt,
      hasChanges: input.hasGeneratorPromptChanges,
    },
    convexEnabled: input.convexEnabled,
    hasPendingChanges: input.hasPendingChanges,
    changelog: {
      dataset: input.datasetChangelog,
      psychoactiveManual: input.psychoactiveManualChangelog,
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
    draft.changelog.psychoactiveManual,
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
    psychoactiveIndexManualData: draft.psychoactiveIndexManual,
    aboutMarkdown: draft.about.markdown,
    aboutSubtitleMarkdown: draft.about.subtitle,
    aboutConfig: { founderProfileKeys: draft.about.founderKeys },
    generatorPrompt: draft.generatorPrompt.hasChanges ? draft.generatorPrompt.content : undefined,
    skipArticles: draft.convexEnabled,
  };
}

export function buildConvexCommandPayload(draft: DevSaveDraft): {
  changedArticles: ArticleRecord[];
  payload: SaveToConvexPayload;
} {
  return buildConvexSavePayload({
    articles: draft.articles,
    originalArticles: draft.originalArticles,
    hasAboutChanges: draft.about.hasChanges,
    aboutMarkdown: draft.about.markdown,
    aboutSubtitle: draft.about.subtitle,
    aboutFounderKeys: draft.about.founderKeys,
    datasetChangelog: draft.changelog.dataset,
  });
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
    noChangesMessage: "No changes detected to commit.",
    verifiedMessage: (key) => `Credentials verified for ${key}. Saving to GitHub...`,
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
