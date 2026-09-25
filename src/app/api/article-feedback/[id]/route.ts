import {
  ArticleFeedbackStorageConfigurationError,
  getArticleFeedbackStore,
} from "@/features/article/feedback/articleFeedbackStore.server";
import { feedbackItemRoute } from "@/lib/http/feedbackItemRoute";

export const runtime = "nodejs";

export const GET = feedbackItemRoute({
  getStore: getArticleFeedbackStore,
  StorageConfigurationError: ArticleFeedbackStorageConfigurationError,
  notFoundMessage: "Article feedback not found.",
  unexpectedErrorLabel: "Failed to read article feedback:",
  unexpectedErrorMessage: "Unable to load that article feedback right now.",
});
