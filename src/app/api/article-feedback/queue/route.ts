import { isArticleFeedbackStatus } from "@/features/article/feedback/articleFeedback";
import {
  ArticleFeedbackStorageConfigurationError,
  getArticleFeedbackStore,
} from "@/features/article/feedback/articleFeedbackStore.server";
import { feedbackQueueRoute } from "@/lib/http/feedbackQueueRoute";

export const runtime = "nodejs";

export const GET = feedbackQueueRoute({
  isStatus: isArticleFeedbackStatus,
  getStore: getArticleFeedbackStore,
  StorageConfigurationError: ArticleFeedbackStorageConfigurationError,
  sourceLabel: "article",
  unexpectedErrorLabel: "Failed to load article feedback queue:",
  unexpectedErrorMessage: "Unable to load article feedback right now.",
});
