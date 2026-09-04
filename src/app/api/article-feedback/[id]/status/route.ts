import { isArticleFeedbackStatus } from "@/features/article/feedback/articleFeedback";
import {
  ArticleFeedbackNotFoundError,
  ArticleFeedbackStorageConfigurationError,
  getArticleFeedbackStore,
} from "@/features/article/feedback/articleFeedbackStore.server";
import { feedbackStatusRoute } from "@/lib/http/feedbackStatusRoute";

export const runtime = "nodejs";

export const POST = feedbackStatusRoute({
  isStatus: isArticleFeedbackStatus,
  getStore: getArticleFeedbackStore,
  NotFoundError: ArticleFeedbackNotFoundError,
  StorageConfigurationError: ArticleFeedbackStorageConfigurationError,
  notFoundMessage: "Article feedback not found.",
  unexpectedErrorLabel: "Failed to update article feedback status:",
  unexpectedErrorMessage: "Unable to update article feedback right now.",
});
